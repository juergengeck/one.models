import WebSocket from 'ws';
import tweetnacl from 'tweetnacl';
import CommunicationServerConnection_Server from './CommunicationServerConnection_Server';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';
import {isClientMessage} from './CommunicationServerProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import WebSocketListener from "./WebSocketListener";

const MessageBus = createMessageBus('CommunicationServer');

type ConnectionContainer = {
    conn: CommunicationServerConnection_Server;
    removeEventListeners: () => void;
};

class CommunicationServer {
    private webSocketListener: WebSocketListener;
    private keyPair: tweetnacl.BoxKeyPair;
    private listeningConnectionsMap: Map<string, ConnectionContainer[]>;
    private openedConnections: Set<WebSocket>;
    private pingInterval: number;
    private pongTimeout: number;

    constructor() {
        this.webSocketListener = new WebSocketListener();
        this.keyPair = tweetnacl.box.keyPair();
        this.listeningConnectionsMap = new Map<string, ConnectionContainer[]>();
        this.openedConnections = new Set<WebSocket>();
        this.pingInterval = 5000;
        this.pongTimeout = 1000;

        this.webSocketListener.onConnection = this.acceptConnection.bind(this);
    }

    public async start(
        host: string,
        port: number,
        pingInterval: number = 5000,
        pongTimeout = 1000
    ): Promise<void> {
        this.pingInterval = pingInterval;
        this.pongTimeout = pongTimeout;
        await this.webSocketListener.start(host, port);
    }

    public async stop(): Promise<void> {

        await this.webSocketListener.stop();

        MessageBus.send('log', `Closing remaining connections`);

        // Close spare connections
        for(const connectionContainers of this.listeningConnectionsMap.values()) {
            for(const connectionContainer of connectionContainers) {
                connectionContainer.conn.close();
            }
        }

        // Close forwarded connections
        for(const ws of this.openedConnections) {
            if(ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }

        MessageBus.send('log', `Closing remaining connections done`);
    }

    private async acceptConnection(ws: WebSocket): Promise<void> {
        MessageBus.send('log', `${wslogId(ws)}: Accepted WebSocket - Waiting for message`);
        try {
            const conn = new CommunicationServerConnection_Server(ws);
            const message = await conn.waitForAnyMessage();

            // For register, let's authenticate the client
            if (isClientMessage(message, 'register')) {
                MessageBus.send(
                    'log',
                    `${wslogId(ws)}: Registering connection for ${Buffer.from(
                        message.publicKey
                    ).toString('hex')}`
                );

                // Step 1: Create, encrypt and send the challenge
                MessageBus.send('log', `${wslogId(ws)}: Register Step 1: Sending auth request`);
                const challenge = await this.createRandomByteArray(64);
                const encryptedChallenge = encryptWithPublicKey(
                    message.publicKey,
                    challenge,
                    this.keyPair.secretKey
                );
                await conn.sendAuthenticationRequestMessage(
                    this.keyPair.publicKey,
                    encryptedChallenge
                );

                // Step 2: Wait for authentication_response, decrypt and verify
                MessageBus.send(
                    'log',
                    `${wslogId(ws)}: Register Step 2: Waiting for auth response`
                );
                const authResponseMessage = await conn.waitForMessage('authentication_response');
                const decryptedChallenge = decryptWithPublicKey(
                    message.publicKey,
                    authResponseMessage.response,
                    this.keyPair.secretKey
                );
                if (!this.testEqualityUint8Array(decryptedChallenge, challenge)) {
                    throw new Error('Client authentication failed.');
                }
                MessageBus.send(
                    'log',
                    `${wslogId(ws)}: Register Step 2: Authentication successful`
                );

                // Step 3: Add to spare map and return success message
                this.pushListeningConnection(message.publicKey, conn);
                await conn.sendAuthenticationSuccessMessage(this.pingInterval);

                // Step 4: Start PingPong
                MessageBus.send('log', `${wslogId(ws)}: Register Step 3: Starting Ping Pong`);
                conn.startPingPong(this.pingInterval, this.pongTimeout);
            }

            // On communication request, let's connect it to a spare connection of the requested publicKey
            else if (isClientMessage(message, 'communication_request')) {
                MessageBus.send(
                    'log',
                    `${wslogId(ws)}: Requesting Relay to ${Buffer.from(
                        message.targetPublicKey
                    ).toString('hex')}`
                );

                const connOther = this.popListeningConnection(message.targetPublicKey);

                // Step 1: Stop the ping ponging
                MessageBus.send('log', `${wslogId(ws)}: Relay Step 1: Stop ping pong`);
                await connOther.stopPingPong();

                // Step 2: Send the handover message
                MessageBus.send('log', `${wslogId(ws)}: Relay Step 2: Send Handover`);
                await connOther.sendConnectionHandoverMessage();

                // Step 3: Forward the communication request
                MessageBus.send('log', `${wslogId(ws)}: Relay Step 3: Forward connection request`);
                await connOther.sendCommunicationRequestMessage(
                    message.sourcePublicKey,
                    message.targetPublicKey
                );

                // Step 4: Forward everything
                MessageBus.send('log', `${wslogId(ws)}: Relay Step 4: Connect both sides`);
                let wsThis = conn.releaseWebSocket();
                let wsOther = connOther.releaseWebSocket();
                wsThis.addEventListener('message', (e) => {
                    wsOther.send(e.data);
                });
                wsOther.addEventListener('message', (e) => {
                    wsThis.send(e.data);
                });
                wsThis.addEventListener('error', (e) => {
                    MessageBus.send('log', `${wslogId(wsThis)}: Error - ${e}`);
                });
                wsOther.addEventListener('error', (e) => {
                    MessageBus.send('log', `${wslogId(wsOther)}: Error - ${e}`);
                });
                wsThis.addEventListener('close', (e) => {
                    this.openedConnections.delete(wsThis);
                    MessageBus.send('log', `${wslogId(wsThis)}: Relay closed - ${e.reason}`);
                    wsOther.close(1000, `Closed by relay: ${e.reason}`);
                });
                wsOther.addEventListener('close', (e) => {
                    this.openedConnections.delete(wsOther);
                    MessageBus.send('log', `${wslogId(wsOther)}: Relay closed - ${e.reason}`);
                    wsThis.close(1000, `Closed by relay: ${e.reason}`);
                });

                this.openedConnections.add(wsThis);
                this.openedConnections.add(wsOther);
            }

            // On unknown message, throw an error
            else {
                throw new Error('Received unexpected or malformed message from client.');
            }
        } catch (e) {
            MessageBus.send('log', `${wslogId(ws)}: ${e}`);
            // TODO: Perhaps we should send the client the reason. Perhaps not, because this would
            // expose whether he is communicating via a commserver or directly. But would it be that bad?
            ws.close();
        }
    }

    /**
     * Generate random bytes based on functions provided by one.core.
     *
     * Note: This is a bad implementation, because it converts a random string to a random Uint8Array.
     *       But the createRandomString converts a random Uint8Array to a string, so this consumes unnecessary
     *       CPU time. But at the moment one.core does not provide a better function. We could probably also
     *       use tweetnacls random generator.
     *
     * @param {number} length
     * @returns {Promise<Uint8Array>}
     */
    private async createRandomByteArray(length: number): Promise<Uint8Array> {
        const randomString = await createRandomString(length * 2, true);
        const randomValues = new Uint8Array(length);
        for (let i = 0; i < randomString.length; i += 2) {
            randomValues[i / 2] = parseInt(randomString.charAt(i) + randomString.charAt(i + 1), 16);
        }
        return randomValues;
    }

    /**
     * Tests whether the two passed Uint8Arrays are equal.
     *
     * @param {Uint8Array} a1 - Array 1 to compare
     * @param {Uint8Array} a2 - Array 2 to compare
     * @returns {boolean} true if equal, false if not.
     */
    private testEqualityUint8Array(a1: Uint8Array, a2: Uint8Array): boolean {
        if (a1.length != a2.length) {
            return false;
        }

        for (let i = 0; i < a1.length; ++i) {
            if (a1[i] !== a2[i]) {
                return false;
            }
        }

        return true;
    }

    private pushListeningConnection(
        publicKey: Uint8Array,
        conn: CommunicationServerConnection_Server
    ): void {
        const strPublicKey = Buffer.from(publicKey).toString('hex');
        MessageBus.send(
            'debug',
            `${wslogId(conn.webSocket)}: pushListeningConnection(${strPublicKey})`
        );

        // Add handler that removes the connection from the listening list when the ws closes
        const boundRemoveHandler = this.removeListeningConnection.bind(this, publicKey, conn);
        conn.webSocket.addEventListener('close', boundRemoveHandler);

        // Add handler that is called when the connection is bound to an incoming connection
        const removeEventListeners = () => {
            conn.webSocket.removeEventListener('close', boundRemoveHandler);
        };

        // Add connection to listeners list
        const connContainer: ConnectionContainer = {
            conn,
            removeEventListeners
        };
        const connectionList = this.listeningConnectionsMap.get(strPublicKey);
        if (!connectionList) {
            this.listeningConnectionsMap.set(strPublicKey, [connContainer]);
        } else {
            connectionList.push(connContainer);
        }
    }

    private removeListeningConnection(
        publicKey: Uint8Array,
        conn: CommunicationServerConnection_Server
    ): void {
        const strPublicKey = Buffer.from(publicKey).toString('hex');
        MessageBus.send(
            'debug',
            `${wslogId(conn.webSocket)}: removeListeningConnection(${strPublicKey})`
        );

        const connectionList = this.listeningConnectionsMap.get(strPublicKey);
        if (connectionList) {
            this.listeningConnectionsMap.set(
                strPublicKey,
                connectionList.filter((elem) => elem.conn != conn)
            );
        }
    }

    private popListeningConnection(publicKey: Uint8Array): CommunicationServerConnection_Server {
        const strPublicKey = Buffer.from(publicKey).toString('hex');
        MessageBus.send('debug', `popListeningConnection(${strPublicKey})`);

        // Get the connection list for the current public key
        const connectionList = this.listeningConnectionsMap.get(strPublicKey);
        if (!connectionList) {
            throw new Error('No listening connection for the specified publicKey.');
        }

        // Remove the list if it only has one element remaining
        if (connectionList.length <= 1) {
            this.listeningConnectionsMap.delete(strPublicKey);
        }

        // Get the topmost spare connection
        const connContainer = connectionList.pop();
        if (!connContainer) {
            throw new Error(
                'No listening connection for the specified publicKey. This error should never happen!'
            );
        }
        MessageBus.send(
            'debug',
            `${wslogId(
                connContainer.conn.webSocket
            )}: popListeningConnection(${strPublicKey}) - Returned`
        );

        // Remove the close listener
        connContainer.removeEventListeners();
        return connContainer.conn;
    }
}

export default CommunicationServer;
