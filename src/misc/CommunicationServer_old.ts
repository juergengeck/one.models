import {Server as WebSocketServer, default as WebSocket, Data, MessageEvent} from 'ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {box, BoxKeyPair} from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';

const MessageBus = createMessageBus('CommunicationServer');

/**
 * --- register: instance -> communication server ---
 *
 * Instance tell to communication server that wats to wait new connections.
 * Has to specify it's public key.
 *
 *
 * --- authenticate: communication server -> instance ---
 *
 * communication server tells the instance that has to authenticate first.
 * The message contain server public key and an string which was encrypted
 * using received instance public key and server private key.
 * For proving it's authenticity, the instance has to decrypt the string
 * received using it's private key and the received server public key.
 * And then re-encrypt the obtained string using instance private key
 * and received server public key.
 *
 *
 * --- authenticate: instance-> communication server ---
 *
 * Instance wants to authenticate in front of the communication server,
 * so it sends again it's public key and the re-encrypted string.
 * The server decrypts the received string using server private key and
 * received instance public key.
 * If the decrypted string is the same as the sent one, the instance has
 * proved that it has the private key corresponding to the sent public key.
 *
 *
 * --- listening: communication server -> instance ---
 *
 * The communication server tells the instance that the authentication has
 * finished successful and now if a instance wants to connect to it, the
 * connection will be established.
 *
 *
 * --- connect: instance -> communication server ---
 *
 * The instance tells the communication server that wants to connect with
 * the instance who has proved to have the specified public key.
 *
 *
 * --- connect: communication server -> instance ---
 *
 * communication server has established a connection between two instances
 * and tells to both instances that they have established a new connection.
 *
 *
 * --- message: instance1 -> communication server -> instance2 ---
 *
 * For messages the communication server just forwards them.
 *
 *
 * --- error: communication server -> instance ---
 *
 * When an error is encountered, the communication server will let the
 * instance know about the issue that has appeared.
 *
 */
export interface InitialMessageType {
    command: 'register' | 'authenticate' | 'listening' | 'connect' | 'message' | 'error';
    pubKey?: string;
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
        this.websocketServerKeyPairs = box.keyPair();
    }

    /**
     * Start the communication server.
     *
     * It is possible to use the same port for registering and
     * incoming connections
     *
     * TODO: Add support for encrypted connections
     */
    public async start(host: string, port: number): Promise<void> {
        MessageBus.send('log', `Starting WebSocket server at ${host}:${port}`);

        this.webSocketServer = new WebSocketServer({host, port});
        this.webSocketServer.on('connection', ws => {
            this.acceptNewConnection(ws);
        });

        MessageBus.send('log', 'WebSocket server started.');
    }

    /**
     * Stop the communication server
     *
     * This terminates all connections and shuts the server down.
     */
    public async stop(): Promise<void> {
        if (this.webSocketServer !== undefined) {
            MessageBus.send('log', 'Closed WebSocket server');
            this.webSocketServer.close();
            this.webSocketServer = undefined;
            this.registeredConnections.forEach((value, _) => {
                value.forEach(websocket => websocket.close());
            });
            this.registeredConnections.clear();
        }
    }

    // ############ PRIVATE API ############

    /**
     * When a new web socket connects to the communication server, add events handlers.
     *
     * @param ws - new connected web socket
     */
    private acceptNewConnection(ws: WebSocket): void {
        MessageBus.send('log', 'A client is connected.');
        // set onmessage to parseInitialMessage;
        // Fired when data is received through a WebSocket.
        ws.on('message', async data => {
            await this.parseInitialMessage({
                data,
                type: 'message',
                target: ws
            });
        });

        // handle onclose and other stuff correctly
        // Fired when a connection with a WebSocket is closed.
        ws.on(
            'close',
            (event: {wasClean: boolean; code: number; reason: string; target: WebSocket}) => {
                MessageBus.send('log', 'Close web socket connection.');
                // -> disconnecting the corresponding peer if it was connected
                if (event.target) {
                    event.target.close();
                }
                // -> removing it from the registeredConnections if it was not connected
                if (this.registeredConnections) {
                    this.registeredConnections.forEach((value, key) => {
                        value = value.filter(websocket => websocket !== event.target);
                        this.registeredConnections.set(key, value);
                    });
                }
            }
        );

        // Fired when a connection with a WebSocket has been closed
        // because of an error, such as when some data couldn't be sent.
        ws.on('error', error => {
            MessageBus.send('error', JSON.stringify(error));
        });

        // Fired when the instance calls the ping method on the web socket.
        ws.on('ping', () => {
            // Call pong method to let the instance know that the server is still running.
            ws.pong();
        });
    }

    /**
     * This is a web socket onmessage handler that handles messages
     * from newly established connections.
     *
     * It determines whether it is a listening connection or if it is
     * a connection attempt to a listening connection.
     */
    private async parseInitialMessage(event: {
        data: WebSocket.Data;
        type: string;
        target: WebSocket;
    }) {
        MessageBus.send('log', `received message: ${event.data}`);
        const message = JSON.parse(event.data as string) as InitialMessageType;
        // {
        // command: 'register';
        // pubKey: 'messageSenderInstancePublicKey'
        // }
        if (message.command === 'register' && message.pubKey) {
            await this.onRegister(event, message.pubKey);
        }
        // {
        // command: 'authenticate';
        // pubKey: 'messageSenderInstancePublicKey'
        // response: 'decrypted string
        // }
        if (message.command === 'authenticate' && message.pubKey && message.response) {
            await this.onAuthenticate(event, message.pubKey, message.response);
        }
        // {
        // command: 'connect';
        // pubKey: 'instanceWithWhoIWantToConnectPublicKey'
        // }
        if (message.command === 'connect' && message.pubKey) {
            await this.onConnect(event, message.pubKey);
        }
    }

    /**
     * When a new instance wants to register to the communication server,
     * a challenge response is sent back to the instance that initiates
     * the connection, to prove that the instance has the private key
     * that corresponds to the received public key.
     *
     * @param event - the received message
     * @param pubKey - public key of the instance
     */
    private async onRegister(event: MessageEvent, pubKey: string): Promise<void> {
        MessageBus.send('log', 'Initiate challenge response.');
        // If register command with pub key
        const randomString = await createRandomString(16);
        this.connectionsToBeAuthenticated.set(pubKey, randomString);
        const encryptedString = encryptWithPublicKey(
            toByteArray(pubKey),
            toByteArray(randomString),
            this.websocketServerKeyPairs.secretKey
        );
        const challengeResponse: InitialMessageType = {
            command: 'authenticate',
            pubKey: fromByteArray(this.websocketServerKeyPairs.publicKey),
            response: fromByteArray(encryptedString)
        };
        // challenge response
        event.target.send(JSON.stringify(challengeResponse));
    }

    /**
     * After the challenge response was initiated by the communication server,
     * the instance has to decrypt the received string with it's private key and
     * the re-encrypt the decrypted string using server public key (received in the
     * authenticated object) and it's private key.
     *
     * The server will decrypt the received authentication response using it's private
     * key and instance public key. The instance public key was sent by the instance
     * inside the authentication object.
     *
     * @param event - the received message
     * @param pubKey - public key of the instance
     * @param response - the received encrypted string
     */
    private async onAuthenticate(
        event: MessageEvent,
        pubKey: string,
        response: string
    ): Promise<void> {
        // set onmessage to respondWithError
        event.target.on('message', CommunicationServer.respondWithError);
        // add ws to registeredConnections
        const sentString = this.connectionsToBeAuthenticated.get(pubKey);
        const decryptedReceivedString = await decryptWithPublicKey(
            toByteArray(pubKey),
            toByteArray(response),
            this.websocketServerKeyPairs.secretKey
        );
        const receivedString = fromByteArray(decryptedReceivedString);

        if (sentString && sentString === receivedString) {
            this.connectionsToBeAuthenticated.delete(pubKey);
            const existingConnectionForThisInstance = this.registeredConnections.get(pubKey);
            const newConnectionsArrayForThisInstance = existingConnectionForThisInstance
                ? [...existingConnectionForThisInstance, event.target]
                : [event.target];
            MessageBus.send('log', 'New connection registered:' + pubKey);
            this.registeredConnections.set(pubKey, newConnectionsArrayForThisInstance);

            event.target.send(
                JSON.stringify({
                    command: 'listening'
                })
            );
        }
    }

    /**
     * When a connect message is received, check if there is an instance with
     * the received public key which waits for a connection.
     *
     * If it is, establish a connection between the instance who has sent the
     * connect message and the instance who has an open websocket connection.
     *
     * If not send an error message to the instance who tries to connects to
     * an unreachable instance.
     *
     * @param event - the received message
     * @param pubKey - public key of the instance
     */
    private async onConnect(event: MessageEvent, pubKey: string): Promise<void> {
        // If connect with pub key command
        const expectedReceiverOpenedConnections = this.registeredConnections.get(pubKey);
        // check in registeredConnections for a suitable connection
        if (expectedReceiverOpenedConnections) {
            // send a (tbd) message to suitable connection and remove it from registeredConnections
            const connectInstances: InitialMessageType = {
                command: 'connect',
                response: 'Connection established.'
            };
            const otherInstanceWebSocket = expectedReceiverOpenedConnections[0];
            otherInstanceWebSocket.send(JSON.stringify(connectInstances));
            event.target.send(JSON.stringify(connectInstances));
            this.registeredConnections.set(pubKey, expectedReceiverOpenedConnections.slice(1));
            // set onmessage on both connections to forwardMessage (binding the first argument to the other peer)
            otherInstanceWebSocket.on('message', (messageEvent: MessageEvent) => {
                this.forwardMessage(event.target, messageEvent);
            });
            event.target.on('message', (messageEvent: MessageEvent) => {
                this.forwardMessage(otherInstanceWebSocket, messageEvent);
            });
        } else {
            MessageBus.send('log', 'Pair connection unavailable.');
            event.target.send(
                JSON.stringify({
                    command: 'error',
                    response: 'pair connection unavailable'
                })
            );
        }
    }

    /**
     * This is a web socket message handler that is registered when receiving a message is unexpected.
     *
     * It will return an error message to the sender.
     */
    private static respondWithError(event: {data: Data; type: string; target: WebSocket}) {
        MessageBus.send('log', 'Reply with error.');
        // return error to client (perhaps close connection and deregister it?)
        const errorMessage: InitialMessageType = {
            command: 'error',
            response: 'message not expected'
        };
        if (event.target) {
            event.target.send(JSON.stringify(errorMessage));
            event.target.close();
        }
    }

    /**
     * This is a web socket message handler that forwards messages to another web socket connection.
     *
     * It will return an error message to the sender.
     */
    private forwardMessage(forwardTo: WebSocket, event: MessageEvent) {
        MessageBus.send('log', 'Forward message.');
        // forward message to forwardTo client
        forwardTo.send(event);

        // let the sender know if there was an error in sending it's message
        forwardTo.on('error', () => {
            if (event.target) {
                event.target.send(
                    JSON.stringify({
                        command: 'error',
                        response: 'could not send message to destination'
                    })
                );
            }
        });
    }

    /**
     * Stores registered web sockets that are still available to be allocated to an incoming connection.
     */
    private readonly registeredConnections: Map<string, WebSocket[]>;
    /**
     * Stores the communication server web socket.
     */
    private webSocketServer: undefined | WebSocket.Server;
    /**
     * Stores the public key and the random string associated with the instance until the authentication step is done.
     */
    private connectionsToBeAuthenticated: Map<string, string>;
    /**
     * Generated keys for the communication server.
     */
    private websocketServerKeyPairs: BoxKeyPair;
}
