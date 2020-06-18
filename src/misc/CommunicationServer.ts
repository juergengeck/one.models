import {Server as WebSocketServer, default as WebSocket, Data} from 'ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {box, randomBytes} from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';

const MessageBus = createMessageBus('CommunicationServer');

export interface InitialMessageType {
    command: 'register' | 'connect' | 'authenticate' | 'error';
    pubKey: string;
    response?: string;
}

/**
 * This class implements the communication server.
 */
export default class CommunicationServer {
    /**
     * Constructor for the CommunicationServer
     */
    constructor() {
        this.registeredConnections = new Map<string, WebSocket[]>();
        this.webSocketServer = undefined;
        this.connectionsToBeAuthenticated = new Map<string, string>();
    }

    /**
     * Start the communication server.
     *
     * It is possible to use the same port for registering and
     * incoming connections
     */
    public start(host: string, port: number): void {
        MessageBus.send('log', `Starting WebSocket server at ${host}:${port}`);

        this.webSocketServer = new WebSocketServer({host, port});
        this.webSocketServer.on('connection', this.acceptNewConnection);
    }

    /**
     * Stop the communication server
     *
     * This terminates all connections and shuts the server down.
     */
    public stop(): void {
        if (this.webSocketServer !== undefined) {
            MessageBus.send('log', 'Closed WebSocket server');
            this.webSocketServer.close();
            this.webSocketServer = undefined;
        }
    }

    // ############ PRIVATE API ############

    private acceptNewConnection(ws: WebSocket): void {
        // set onmessage to parseInitialMessage;
        ws.onmessage = this.parseInitialMessage;

        // handle onclose and other stuff correctly
        ws.onclose = (event: {
            wasClean: boolean;
            code: number;
            reason: string;
            target: WebSocket;
        }) => {
            MessageBus.send('log', 'close web socket connection');
            // -> disconnecting the corresponding peer if it was connected
            event.target.close();
            // -> removing it from the registeredConnections if it was not connected
            this.registeredConnections.forEach((value, key) => {
                value = value.filter((websocket) => websocket !== event.target);
                this.registeredConnections.set(key, value);
            });
        };
    }

    /**
     * This is a web socket onmessage handler that handles messages from newly established connections.
     *
     * It determines whether it is a listening connection or if it is a connection attempt to a listening connection
     */
    private async parseInitialMessage(event: {
        data: WebSocket.Data;
        type: string;
        target: WebSocket;
    }) {
        const message = JSON.parse(event.data as string) as InitialMessageType;
        MessageBus.send('log', `received message: ${message}`);
        // {
        // command: 'register';
        // pubKey: 'messageSenderInstancePublicKey'
        // }
        if (message.command === 'register') {
            // If register command with pub key
            const randomString = await createRandomString();
            this.connectionsToBeAuthenticated.set(message.pubKey, randomString);
            const encryptedString = this.encryptMessageWIthReceivedKey(
                message.pubKey,
                randomString
            );
            const challengeResponse: InitialMessageType = {
                command: 'authenticate',
                pubKey: message.pubKey,
                response: encryptedString
            };
            // -> challenge response
            event.target.send(JSON.stringify(challengeResponse));
            return;
        }
        // {
        // command: 'authenticate';
        // pubKey: 'messageSenderInstancePublicKey'
        // response: 'decrypted string
        // }
        if (message.command === 'authenticate') {
            // -> set onmessage to respondWithError
            event.target.onmessage = this.respondWithError;
            // -> add ws to registeredConnections
            const sentString = this.connectionsToBeAuthenticated.get(message.pubKey);
            if (sentString && sentString === message.response) {
                this.connectionsToBeAuthenticated.delete(message.pubKey);
                const existingConnectionForThisInstance = this.registeredConnections.get(
                    message.pubKey
                );
                const newConnectionsArrayForThisInstance = existingConnectionForThisInstance
                    ? [...existingConnectionForThisInstance, event.target]
                    : [event.target];
                this.registeredConnections.set(message.pubKey, newConnectionsArrayForThisInstance);
            }
        }
        // {
        // command: 'connect';
        // pubKey: 'instanceWithWhoIWantToConnectPublicKey'
        // }
        if (message.command === 'connect') {
            // If connect with pub key command
            // -> check in registeredConnections for a suitable connection
            // -> if found
            const expectedReceiverOpenedConnections = this.registeredConnections.get(
                message.pubKey
            );
            if (expectedReceiverOpenedConnections) {
                //   -> send a (tbd) message to suitable connection and remove it from registeredConnections
                const connectInstances: InitialMessageType = {
                    command: 'connect',
                    pubKey: message.pubKey
                };
                const otherInstanceWebSocket = expectedReceiverOpenedConnections[0];
                otherInstanceWebSocket.send(JSON.stringify(connectInstances));
                this.registeredConnections.set(
                    message.pubKey,
                    expectedReceiverOpenedConnections.slice(1)
                );
                //   -> set onmessage on both connections to forwardMessage (binding the first argument to the other peer)
                otherInstanceWebSocket.onmessage = (messageEvent: WebSocket.MessageEvent) => {
                    this.forwardMessage(event.target, messageEvent);
                };
                event.target.onmessage = (messageEvent: WebSocket.MessageEvent) => {
                    this.forwardMessage(otherInstanceWebSocket, messageEvent);
                };
            }
        }
    }

    private encryptMessageWIthReceivedKey(publicKey: string, message: string): string {
        const nonce = randomBytes(box.nonceLength);
        const messageUint8Array = toByteArray(message);
        const pubKeyUint8Array = toByteArray(publicKey);
        const encrypted = box.after(messageUint8Array, nonce, pubKeyUint8Array);

        const fullMessage = new Uint8Array(nonce.length + encrypted.length);
        fullMessage.set(nonce);
        fullMessage.set(encrypted, nonce.length);

        return fromByteArray(fullMessage);
    }

    /**
     * This is a web socket message handler that is registered when receiving a message is unexpected.
     *
     * It will return an error message to the sender.
     */
    private respondWithError(event: {data: Data; type: string; target: WebSocket}) {
        // return error to client (perhaps close connection and deregister it?)
        const errorMessage: InitialMessageType = {
            command: 'error',
            pubKey: 'CommServer',
            response: 'message not expected'
        };
        event.target.send(JSON.stringify(errorMessage));
        event.target.close();
    }

    /**
     * This is a web socket message handler that forwards messages to another web socket connection.
     *
     * It will return an error message to the sender.
     */
    private forwardMessage(
        forwardTo: WebSocket,
        event: {
            data: Data;
            type: string;
            target: WebSocket;
        }
    ) {
        // forward message to forwardTo client
        forwardTo.send(event.data);
    }

    /**
     * Stores registered web sockets that are still available to be allocated to an incoming connection.
     */
    private registeredConnections: Map<string, WebSocket[]>;

    /**
     * Stores the communication server web socket.
     */
    private webSocketServer: undefined | WebSocket.Server;
    /**
     * Stores the public key and the random string associated with the instance until the authentication step is done.
     */
    private connectionsToBeAuthenticated: Map<string, string>;
}
