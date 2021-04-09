import WebSocket from 'isomorphic-ws';
import tweetnacl from 'tweetnacl';
import CommunicationServerConnection_Server from './CommunicationServerConnection_Server';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';
import {isClientMessage} from './CommunicationServerProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import WebSocketListener from './WebSocketListener';
import WebSocketPromiseBased from './WebSocketPromiseBased';

const MessageBus = createMessageBus('CommunicationServer');

/**
 * Container for storing registered connections.
 */
type ConnectionContainer = {
    conn: CommunicationServerConnection_Server;
    removeEventListeners: () => void;
};

/**
 * This class implements the communication server.
 */
class CommunicationServer {
    private webSocketListener: WebSocketListener; // The web socket server that accepts connections
    private keyPair: tweetnacl.BoxKeyPair; // The key pair used for the commserver
    private listeningConnectionsMap: Map<string, ConnectionContainer[]>; // Map that stores spare connections
    private openedConnections: Set<WebSocket>; // List of established relays
    private pingInterval: number; // Interval used to ping spare connections
    private pongTimeout: number; // Timeout used to wait for pong responses

    /**
     * Create the communication server.
     */
    constructor() {
        this.webSocketListener = new WebSocketListener();
        this.keyPair = tweetnacl.box.keyPair();
        this.listeningConnectionsMap = new Map<string, ConnectionContainer[]>();
        this.openedConnections = new Set<WebSocket>();
        this.pingInterval = 5000;
        this.pongTimeout = 1000;

        this.webSocketListener.onConnection(this.acceptConnection.bind(this));
    }

    /**
     * Start the communication server.
     *
     * @param {string} host - The host to bind to.
     * @param {number} port - The port to bind to.
     * @param {number} pingInterval - The interfval in which pings are sent for spare connections.
     * @param {number} pongTimeout - The timeout used to wait for pongs.
     * @returns {Promise<void>}
     */
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

    /**
     * Stop the communication server.
     *
     * @returns {Promise<void>}
     */
    public async stop(): Promise<void> {
        await this.webSocketListener.stop();

        MessageBus.send('log', `Closing remaining connections`);

        // Close spare connections
        for (const connectionContainers of this.listeningConnectionsMap.values()) {
            for (const connectionContainer of connectionContainers) {
                connectionContainer.conn.close();
            }
        }

        // Close forwarded connections
        for (const ws of this.openedConnections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }

        MessageBus.send('log', `Closing remaining connections done`);
    }

    /**
     * Accept a new connection.
     *
     * This method will then wait for a message indicating whether:
     * 1) a client wants to register
     * 2) somebody wants a relay to a registered client
     *
     * @param {WebSocket} ws - The accepted websocket
     * @returns {Promise<void>}
     */
    private async acceptConnection(ws: WebSocketPromiseBased): Promise<void> {
        MessageBus.send(
            'log',
            `${wslogId(ws.webSocket)}: Accepted WebSocket - Waiting for message`
        );
        try {
            const conn = new CommunicationServerConnection_Server(ws);
            const message = await conn.waitForAnyMessage();

            // For register, let's authenticate the client
            if (isClientMessage(message, 'register')) {
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Registering connection for ${Buffer.from(
                        message.publicKey
                    ).toString('hex')}`
                );

                // Step 1: Create, encrypt and send the challenge
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Register Step 1: Sending auth request`
                );
                const challenge = tweetnacl.randomBytes(64);
                const encryptedChallenge = encryptWithPublicKey(
                    message.publicKey,
                    challenge,
                    this.keyPair.secretKey
                );
                await conn.sendAuthenticationRequestMessage(
                    this.keyPair.publicKey,
                    encryptedChallenge
                );

                // Negate all bits in the challenge, so that an attacker can't just send back the
                // challenge unencrypted (symmetric keys!)
                for (let i = 0; i < challenge.length; ++i) {
                    challenge[i] = ~challenge[i];
                }

                // Step 2: Wait for authentication_response, decrypt and verify
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Register Step 2: Waiting for auth response`
                );
                const authResponseMessage = await conn.waitForMessage('authentication_response');
                const decryptedChallenge = decryptWithPublicKey(
                    message.publicKey,
                    authResponseMessage.response,
                    this.keyPair.secretKey
                );
                if (!tweetnacl.verify(decryptedChallenge, challenge)) {
                    throw new Error('Client authentication failed.');
                }
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Register Step 2: Authentication successful`
                );

                // Step 3: Add to spare map and return success message
                this.pushListeningConnection(message.publicKey, conn);
                await conn.sendAuthenticationSuccessMessage(this.pingInterval);

                // Step 4: Start PingPong
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Register Step 3: Starting Ping Pong`
                );
                conn.startPingPong(this.pingInterval, this.pongTimeout);
            }

            // On communication request, let's connect it to a spare connection of the requested publicKey
            else if (isClientMessage(message, 'communication_request')) {
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Requesting Relay to ${Buffer.from(
                        message.targetPublicKey
                    ).toString('hex')}`
                );

                const connOther = this.popListeningConnection(message.targetPublicKey);

                // Step 1: Stop the ping ponging
                MessageBus.send('log', `${wslogId(ws.webSocket)}: Relay Step 1: Stop ping pong`);
                await connOther.stopPingPong();

                // Step 2: Send the handover message
                MessageBus.send('log', `${wslogId(ws.webSocket)}: Relay Step 2: Send Handover`);
                await connOther.sendConnectionHandoverMessage();

                // Step 3: Forward the communication request
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Relay Step 3: Forward connection request`
                );
                await connOther.sendCommunicationRequestMessage(
                    message.sourcePublicKey,
                    message.targetPublicKey
                );

                // Step 4: Forward everything
                // TODO: Because we send the communicationRequestMessage on Step3 (with an await) it is theoretically
                // possible, that the answer is received before the web socket send call returns.
                // So it might be possible that the old websocket 'message' handler is scheduled before the new
                // message handler is registered because the 'message' call is scheduled before the await is scheduled
                // (by resolve call after websocket.send())
                // This would only happen if the CPU is so slow, that the websocket send returns after the answer was
                // processed by the kernel. This is so unlikely it seems impossible.
                // A fix would be to call the send after the events have been rewired. But then we cannot use the
                // connection class with the current architecture. So we will do that probably later when we see problems
                MessageBus.send(
                    'log',
                    `${wslogId(ws.webSocket)}: Relay Step 4: Connect both sides`
                );
                let wsThis = conn.releaseWebSocket();
                let wsOther = connOther.releaseWebSocket();
                wsThis.addEventListener('message', (msg: any) => {
                    wsOther.send(msg.data);
                });
                wsOther.addEventListener('message', (msg: any) => {
                    wsThis.send(msg.data);
                });
                wsThis.addEventListener('error', (e: any) => {
                    MessageBus.send('log', `${wslogId(wsThis)}: Error - ${e}`);
                });
                wsOther.addEventListener('error', (e: any) => {
                    MessageBus.send('log', `${wslogId(wsOther)}: Error - ${e}`);
                });
                wsThis.addEventListener('close', (e: any) => {
                    this.openedConnections.delete(wsThis);
                    MessageBus.send('log', `${wslogId(wsThis)}: Relay closed - ${e.reason}`);
                    wsOther.close(1000, `Closed by relay: ${e.reason.substr(0, 100)}`);
                });
                wsOther.addEventListener('close', (e: any) => {
                    this.openedConnections.delete(wsOther);
                    MessageBus.send('log', `${wslogId(wsOther)}: Relay closed - ${e.reason}`);
                    wsThis.close(1000, `Closed by relay: ${e.reason.substr(0, 100)}`);
                });

                this.openedConnections.add(wsThis);
                this.openedConnections.add(wsOther);
            }

            // On unknown message, throw an error
            else {
                throw new Error('Received unexpected or malformed message from client.');
            }
        } catch (e) {
            MessageBus.send('log', `${wslogId(ws.webSocket)}: ${e}`);
            // TODO: Perhaps we should send the client the reason. Perhaps not, because this would
            // expose whether he is communicating via a commserver or directly. But would it be that bad?
            ws.close();
        }
    }

    /**
     * Adds a spare connection the the listening connection array.
     *
     * This also adds an event listener to the 'close' event, so that the connection is automatically
     * removed from the listeningConnections list when the websocket is closed.
     *
     * @param {Uint8Array} publicKey - The public key of the registering client.
     * @param {CommunicationServerConnection_Server} conn - The connection that is registered.
     */
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

    /**
     * Remove the listening connection from the listeningConnection list.
     *
     * This is used to remove it when the websocket is closed before a relay with it has been established.
     *
     * @param {Uint8Array} publicKey - The public key of the registering client.
     * @param {CommunicationServerConnection_Server} conn - The connection that is removed.
     */
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
                connectionList.filter(elem => elem.conn != conn)
            );
        }
    }

    /**
     * Pops one listening / spare connection from the listenningConnections list that matches the
     * public key. This is used to find a relay match.
     *
     * @param {Uint8Array} publicKey - The public key of the registering client / the target of the requested relay.
     * @returns {CommunicationServerConnection_Server} The found connection.
     */
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
