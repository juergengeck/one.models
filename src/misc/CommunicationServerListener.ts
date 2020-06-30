import CommunicationServerConnection_Client from './CommunicationServerConnection_Client';
import WebSocket from 'ws';
import {createMessageBus} from "one.core/lib/message-bus";
import {wslogId} from "./LogUtils";

const MessageBus = createMessageBus('CommunicationServerListener');

export enum CommunicationServerListenerState {
    NotListening,
    Connecting,
    Listening
}

class CommunicationServerListener {
    /**
     * Handler used after a connection between two instances has been established.
     */
    public onConnection: ((webSocket: WebSocket) => void) | null;

    /**
     * Handler for proving that the instance that has asked to register on the
     * communication server has the corresponding private key to the public key
     * sent in the registration process.
     *
     * The expected behaviour: the instance will decrypt the challenge string
     * using it's private key and the received server public key and will
     * re-encrypt the decrypted string using it's private key and the received
     * server public key. The re-encrypted string will be returned.
     */
    public onChallenge: ((challenge: Uint8Array, publicKey: Uint8Array) => Uint8Array) | null;

    /**
     * Handler for state change.
     *
     * When the state of the connector changes, this callback will be called
     * in order to have access from outside to the errors that occur on the
     * web socket level.
     */
    public onStateChange:
        | ((
              newState: CommunicationServerListenerState,
              oldState: CommunicationServerListenerState,
              reason?: string
          ) => void)
        | null;

    /**
     * Reconnect timeout.
     */
    private readonly reconnectTimeout: number;

    /**
     * Current connection state.
     */
    private communicationServerConnectorState: CommunicationServerListenerState;

    /**
     * List of opened web socket which have no partner for moment.
     */
    private spareConnections: CommunicationServerConnection_Client[];

    private spareConnectionLimit: number;

    private spareConnectionScheduled: boolean;

    private running: boolean;

    private delayScheduleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    constructor(spareConnectionLimit: number, reconnectTimeout = 10000) {
        this.spareConnectionLimit = spareConnectionLimit;
        this.spareConnections = [];
        this.spareConnectionScheduled = false;
        this.reconnectTimeout = reconnectTimeout;
        this.running = false;

        this.onConnection = null;
        this.onChallenge = null;
        this.onStateChange = null;
        this.communicationServerConnectorState = CommunicationServerListenerState.NotListening;
    }

    /**
     *
     * @param {string} server
     * @param {string} publicKey
     * @returns {Promise<void>}
     */
    public start(server: string, publicKey: Uint8Array): void {
        MessageBus.send('log', `start(${server})`);
        if(this.running) {
            throw Error('Already running');
        }

        this.running = true;
        this.changeCurrentState(CommunicationServerListenerState.Connecting);
        this.scheduleSpareConnection(server, publicKey);
    }

    public stop(): void {
        MessageBus.send('log', `stop()`);
        this.running = false;
        for(const spareConnection of this.spareConnections) {
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
     * -> on failure
     *
     * @param server
     * @param publicKey
     * @param delayed
     */
    private scheduleSpareConnection(server: string, publicKey: Uint8Array, delayed: boolean = false): void {
        MessageBus.send('debug', `scheduleSpareConnection(${server}, ${delayed})`);

        // Check prerequisites for scheduling
        if(!this.onChallenge) {
            throw Error('onChallenge clalback is not registered.')
        }
        if(!this.running) { // do not schedule if already stopped
            return;
        }
        if (this.spareConnections.length >= this.spareConnectionLimit) { // Do not schedule if enough connections are open
            return;
        }

        // If delayed is true, then schedule the call for later and return (in case of errors)
        // do not schedule if already one delayed schedule is pending
        if(delayed) {
            if(!this.spareConnectionScheduled) {
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
        const handoverConnection = (connection: CommunicationServerConnection_Client, err?: Error) => {

            // The connection is no longer a spare connection, so remove it
            this.removeSpareConnection(connection);

            // Do not schedule if already stopped
            if(!this.running) {
                if(connection.webSocket.readyState === WebSocket.OPEN) {
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
                if (this.onConnection) {
                    this.onConnection(connection.releaseWebSocket());
                }
            }
        };

        // Try to register a connection at the comm server
        CommunicationServerListener.establishListeningConnection(
            server,
            publicKey,
            handoverConnection,
            this.onChallenge
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

    private addSpareConnection(connection: CommunicationServerConnection_Client): void {
        MessageBus.send('debug', `addSpareConnection(${wslogId(connection.webSocket)})`);
        this.spareConnections.push(connection);
        this.updateState();
    }

    private removeSpareConnection(connection: CommunicationServerConnection_Client): void {
        MessageBus.send('debug', `removeSpareConnection(${wslogId(connection.webSocket)})`);
        this.spareConnections = this.spareConnections.filter((elem) => elem !== connection);
        this.updateState();
    }

    /**
     * Update the current state by evaluating different variables
     */
    private updateState(): void {
        MessageBus.send('debug', `updateState()`);
        if (this.spareConnections.length > 0) {
            this.changeCurrentState(CommunicationServerListenerState.Listening);
        }
        else {
            if(this.running) {
                this.changeCurrentState(CommunicationServerListenerState.Connecting);
            }
            else {
                this.changeCurrentState(CommunicationServerListenerState.NotListening);
            }
        }
    }

    /**
     * When the state of the connector changes, call the onStateChange callback,
     * in order for the connector caller to be aware of the changes that happen
     * in the registration process.
     *
     * @param {CommunicationServerListenerState} newState
     * @param {string} reason
     */
    private changeCurrentState(
        newState: CommunicationServerListenerState,
        reason?: string
    ): void {
        const oldState = this.communicationServerConnectorState;
        this.communicationServerConnectorState = newState;

        if (this.onStateChange && (newState != oldState)) {
            this.onStateChange(newState, oldState, reason);
        }
    }

    // ############ PRIVATE STATIC API ############

    private static async establishListeningConnection(
        server: string,
        publicKey: Uint8Array,
        onConnect: (ws: CommunicationServerConnection_Client, err?: Error) => void,
        onChallenge: (challenge: Uint8Array, publicKey: Uint8Array) => Uint8Array
    ): Promise<CommunicationServerConnection_Client> {
        MessageBus.send('log', `establishConnection(${server})`);

        // Open websocket to communication server
        const connection = new CommunicationServerConnection_Client(server);
        await connection.webSocketPB.waitForOpen(); // not so nice to do it on webSocketPB

        let pingTimeout;

        // Phase 1: Register and authenticate the connection
        try {
            // Step1: Register at comm server
            MessageBus.send('log', `${wslogId(connection.webSocket)}: Step 1: Send 'register' message`);
            await connection.sendRegisterMessage(publicKey);

            // Step2: Wait for authentication request of commserver and check parameters
            MessageBus.send('log', `${wslogId(connection.webSocket)}: Step 2: Wait for authentication_request`);
            const authRequest = await connection.waitForMessage('authentication_request');

            // Step3: Send authentication response
            MessageBus.send('log', `${wslogId(connection.webSocket)}: Step 3: Send authentication_response message`);
            const response = onChallenge(authRequest.challenge, authRequest.publicKey)
            await connection.sendAuthenticationResponseMessage(response);

            // Step4: Wait for authentication success message
            MessageBus.send('log', `${wslogId(connection.webSocket)}: Step 4: Wait for authentication_success message`);
            let authSuccess = await connection.waitForMessage('authentication_success');

            // The ping interval communicated by the server * 3 should be a good timeout. It can handle a short delay of
            // twice the ping interval.
            pingTimeout = authSuccess.pingInterval * 3;
        } catch (e) {
            // If an error happened, close the websocket
            connection.close(e.toString());
            throw e;
        }

        // Phase 2: Listen for connection while ping / ponging the server
        // Step 5: Wait for connection
        MessageBus.send('log', `${wslogId(connection.webSocket)}: Step 5: Wait for connection_handover message`);
        connection
            .waitForMessagePingPong('connection_handover', pingTimeout)
            .then(() => {
                MessageBus.send('log', `${wslogId(connection.webSocket)}: Received connection_handover message`);
                onConnect(connection);
            })
            .catch((err: Error) => {
                onConnect(connection, err);
            });

        // This returns the connection directly after Phase 1, not after Phase 2 completed.
        return connection;
    }
}

export default CommunicationServerListener;