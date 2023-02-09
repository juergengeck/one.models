import type {PublicKey} from '../../../../../one.core/lib/crypto/encryption';
import {hexToUint8Array} from '../../../../../one.core/lib/util/arraybuffer-to-and-from-hex-string';
import CommunicationServerConnection_Client from './CommunicationServerConnection_Client';
import WebSocketWS from 'isomorphic-ws';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {OEvent, EventTypes} from '../../OEvent';
import type Connection from '../../Connection/Connection';

const MessageBus = createMessageBus('CommunicationServerListener');

/**
 * State of the communication server listener.
 */
export enum CommunicationServerListenerState {
    NotListening,
    Connecting,
    Listening
}

/**
 * Class Listens for connections through a communication server.
 *
 * So the purpose of this class is almost the same as that of the websocket server, except
 * that is doesn't accept connections directly, but through a comm-server.
 */
class CommunicationServerListener {
    /**
     * Event is emitted after a connection between two instances has been established.
     */
    public onConnection = new OEvent<(connection: Connection) => void>();

    /**
     * Event is emitted  for proving that the instance that has asked to register on the
     * communication server has the corresponding private key to the public key
     * sent in the registration process.
     *
     * The expected behaviour: the instance will decrypt the challenge string
     * using it's private key and the received server public key and will
     * re-encrypt the decrypted string using it's private key and the received
     * server public key. The re-encrypted string will be returned.
     */
    public onChallenge = new OEvent<(challenge: Uint8Array, publicKey: Uint8Array) => Uint8Array>(
        EventTypes.ExactlyOneListener
    );

    /**
     * Event is emitted when the state of the connector changes. The listener handler
     * will be called in order to have access from outside to the errors that occur on
     * the websocket level.
     */
    public onStateChange = new OEvent<
        (
            newState: CommunicationServerListenerState,
            oldState: CommunicationServerListenerState,
            reason?: string
        ) => void
    >();

    public state: CommunicationServerListenerState; // Current connection state.
    private readonly reconnectTimeout: number; // Reconnect timeout when comm server is not reachable
    private readonly spareConnectionLimit: number; // Maximum number of simultaneously open spare connections
    private readonly encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array;
    private readonly decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array;
    private spareConnections: CommunicationServerConnection_Client[]; // List of opened web socket which have no partner for moment.
    private spareConnectionScheduled: boolean; // Stores whether a new spare connection is scheduled with a delay (after an error happened)
    private running: boolean; // Stores whether the listener is currently running
    private delayScheduleTimeoutHandle: ReturnType<typeof setTimeout> | null = null; // This is the timer handle that opens a spare connection after a delay

    /**
     * Creates a new listener.
     *
     * @param spareConnectionLimit - Number of spare connections to use simultaneously.
     * @param reconnectTimeout - Timeout used to reconnect on error / when the server is not reachable.
     * @param encrypt
     * @param decrypt
     */
    constructor(
        spareConnectionLimit: number,
        reconnectTimeout = 5000,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array
    ) {
        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.spareConnectionLimit = spareConnectionLimit;
        this.spareConnections = [];
        this.spareConnectionScheduled = false;
        this.reconnectTimeout = reconnectTimeout;
        this.running = false;
        this.state = CommunicationServerListenerState.NotListening;
    }

    /**
     * Start the listener through the specified comm server.
     *
     * @param server - The communication server to use.
     * @param publicKey - The public key via which this instance can be reached.
     */
    public start(server: string, publicKey: Uint8Array): void {
        MessageBus.send('log', `start(${server})`);
        if (this.running) {
            throw Error('Already running');
        }

        this.running = true;
        this.changeCurrentState(CommunicationServerListenerState.Connecting);
        this.scheduleSpareConnection(server, publicKey);
    }

    /**
     * Stop the listener.
     *
     * This does not kill fully established connections (passed on via onConnection event). This just
     * terminates the spare connections.
     */
    public stop(): void {
        MessageBus.send('log', 'stop()');
        this.running = false;
        for (const spareConnection of this.spareConnections) {
            spareConnection.close();
        }
        if (this.delayScheduleTimeoutHandle) {
            clearTimeout(this.delayScheduleTimeoutHandle);
        }
    }

    // ############ PRIVATE API ############

    /**
     * This function opens new connections to the communication server until the maximum
     * number of spare connections is opened.
     * If spare connection count drops below the maximum, then another connection is spawned.
     * If the delay flag is set, it delays the opening by the reconnectTimeout, but only if not another
     * delayed call is already pending.
     *
     * The workflow is this:
     * 1) Open a connection to the comm server and authenticate it
     * -> on success goto 1) until the maximum spare connection count is reached
     * -> on failure got 1) after the reconnect timeout
     *
     * @param server
     * @param publicKey
     * @param delayed
     */
    private scheduleSpareConnection(
        server: string,
        publicKey: Uint8Array,
        delayed: boolean = false
    ): void {
        MessageBus.send('debug', `scheduleSpareConnection(${server}, ${delayed})`);

        if (!this.running) {
            // do not schedule if already stopped
            return;
        }
        if (this.spareConnections.length >= this.spareConnectionLimit) {
            // Do not schedule if enough connections are open
            return;
        }

        // If delayed is true, then schedule the call for later and return (in case of errors)
        // do not schedule if already one delayed schedule is pending
        if (delayed) {
            if (!this.spareConnectionScheduled) {
                this.spareConnectionScheduled = true;
                this.delayScheduleTimeoutHandle = setTimeout(() => {
                    this.delayScheduleTimeoutHandle = null;
                    this.spareConnectionScheduled = false;
                    this.scheduleSpareConnection(server, publicKey, false);
                }, this.reconnectTimeout);
            }
            return;
        }

        // This function is called when the communication server sends a handover command to tell
        // that a client has connected and wants to talk, or if an error with this spare connection happens.
        const handoverConnection = (
            connection: CommunicationServerConnection_Client,
            err?: Error
        ) => {
            // The connection is no longer a spare connection, so remove it
            this.removeSpareConnection(connection);

            // Do not schedule if already stopped
            if (!this.running) {
                if (connection.webSocket.readyState === WebSocketWS.OPEN) {
                    connection.close();
                }
                return;
            }

            // On error schedule a spare connection with a delay
            if (err) {
                this.scheduleSpareConnection(server, publicKey, true);
            }

            // On success schedule a new spare connection and give the outside world the connection via event
            else {
                this.scheduleSpareConnection(server, publicKey, false);
                this.onConnection.emit(connection.connection);
            }
        };

        // Try to register a connection at the comm server
        CommunicationServerListener.establishListeningConnection(
            server,
            publicKey,
            handoverConnection,
            this.encrypt,
            this.decrypt
        )

            // On successful register - add the connection to spare connections
            .then((connection: CommunicationServerConnection_Client) => {
                this.addSpareConnection(connection);
                this.scheduleSpareConnection(server, publicKey);
            })

            // On error, try to schedule another connection after reconnectTimeout
            .catch((err: Error) => {
                if (this.running) {
                    this.scheduleSpareConnection(server, publicKey, true);
                }
            });
    }

    /**
     * Adds a spare connection to the spareConnection list and updates the connection state.
     *
     * @param connection
     */
    private addSpareConnection(connection: CommunicationServerConnection_Client): void {
        MessageBus.send('debug', `addSpareConnection(${connection.id})`);
        this.spareConnections.push(connection);
        this.updateState();
    }

    /**
     * Removes a spare connection from the spareConnection list and updates the connection state.
     *
     * @param connection
     */
    private removeSpareConnection(connection: CommunicationServerConnection_Client): void {
        MessageBus.send('debug', `removeSpareConnection(${connection.id})`);
        this.spareConnections = this.spareConnections.filter(elem => elem !== connection);
        this.updateState();
    }

    /**
     * Update the current state by evaluating different variables
     */
    private updateState(): void {
        MessageBus.send('debug', 'updateState()');
        if (this.spareConnections.length > 0) {
            this.changeCurrentState(CommunicationServerListenerState.Listening);
        } else if (this.running) {
            this.changeCurrentState(CommunicationServerListenerState.Connecting);
        } else {
            this.changeCurrentState(CommunicationServerListenerState.NotListening);
        }
    }

    /**
     * When the state of the connector changes, call the onStateChange callback,
     * in order for the connector caller to be aware of the changes that happen
     * in the registration process.
     *
     * @param newState
     * @param reason
     */
    private changeCurrentState(newState: CommunicationServerListenerState, reason?: string): void {
        const oldState = this.state;
        this.state = newState;

        if (newState !== oldState) {
            this.onStateChange.emit(newState, oldState, reason);
        }
    }

    // ############ PRIVATE STATIC API ############

    /**
     * This function implements the whole registering process of one connections.
     *
     * So this function actually implements the protocol workflow:
     * - -> register
     * - <- authentication_request
     * - -> authentication_response
     * - <- authentication_success
     * - <- connection_handover
     *
     * @param server - Server where to register the connection.
     * @param publicKey - public key for which to accept connections.
     * @param onConnect -
     * Handler called when a relay is handed over. (asynchronously after this call has finished)
     * @param encrypt
     * @param decrypt
     * Callback that needs to decrypt / re-encrypt the challenge for authentication. (during
     * this call)
     * @returns The spare connection that is
     * now registered, but not yet connected to a relay (this is done later by the onConnect
     * callback).
     */
    private static async establishListeningConnection(
        server: string,
        publicKey: Uint8Array,
        onConnect: (ws: CommunicationServerConnection_Client, err?: Error) => void,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array
    ): Promise<CommunicationServerConnection_Client> {
        MessageBus.send('debug', `establishConnection(${server})`);

        // Open websocket to communication server
        const connection = new CommunicationServerConnection_Client(server);
        await connection.connection.waitForOpen(); // not so nice to do it on webSocketPB

        let pingTimeout;

        // Phase 1: Register and authenticate the connection
        try {
            // Step1: Register at comm server
            MessageBus.send('debug', `${connection.id}: Step 1: Send 'register' message`);
            await connection.sendRegisterMessage(publicKey);

            // Step2: Wait for authentication request of comm-server and check parameters
            MessageBus.send('debug', `${connection.id}: Step 2: Wait for authentication_request`);
            const authRequest = await connection.waitForMessage('authentication_request');
            const authRequestPublicKey = hexToUint8Array(authRequest.publicKey);

            // Step3: Send authentication response
            MessageBus.send(
                'debug',
                `${connection.id}: Step 3: Send authentication_response message`
            );
            const decryptedChallenge = decrypt(
                authRequestPublicKey,
                hexToUint8Array(authRequest.challenge)
            );
            for (let i = 0; i < decryptedChallenge.length; ++i) {
                decryptedChallenge[i] = ~decryptedChallenge[i];
            }
            const response = encrypt(authRequestPublicKey, decryptedChallenge);
            await connection.sendAuthenticationResponseMessage(response);

            // Step4: Wait for authentication success message
            MessageBus.send(
                'debug',
                `${connection.id}: Step 4: Wait for authentication_success message`
            );
            const authSuccess = await connection.waitForMessage('authentication_success');

            // Step 5: Start answering the ping messages (todo check the pongTimeout again)
            connection.startPingPong(authSuccess.pingInterval, 2000);
        } catch (e) {
            // If an error happened, close the websocket
            connection.close(e.toString());
            throw e;
        }

        // Phase 2: Listen for connection while ping / ponging the server
        // Step 5: Wait for connection
        MessageBus.send('debug', `${connection.id}: Step 5: Wait for connection_handover message`);
        connection
            .waitForMessage('connection_handover')
            .then(() => {
                MessageBus.send('debug', `${connection.id}: Received connection_handover message`);
                connection.stopPingPong();
                onConnect(connection);
            })
            .catch((err: Error) => {
                connection.stopPingPong();
                onConnect(connection, err);
            });

        // This returns the connection directly after Phase 1, not after Phase 2 completed.
        return connection;
    }
}

export default CommunicationServerListener;
