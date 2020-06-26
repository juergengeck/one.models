import {InitialMessageType} from './CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';

enum CommServerConnectorStateType {
    NotListening,
    Registering,
    Listening
}

export default class CommunicationServerConnector {
    constructor(spareConnections: number, reconnectTimeout = 10000, pingTimeout = 5000) {
        this.spareConnections = spareConnections;
        this.waitingList = new Array<WebSocket>(spareConnections);
        this.openedConnections = new Array<WebSocket>();
        this.onConnection = null;
        this.onChallenge = null;
        this.onStateChange = null;
        this.communicationServerConnectorState = CommServerConnectorStateType.NotListening;
        this.reconnectTimeout = reconnectTimeout;
        this.pingTimeout = pingTimeout;
    }

    /**
     * Creates web socket connections to the specify communication server.
     * The number of web sockets that will be register in the comm server
     * is specified in the constructor as spareConnections.
     *
     * @param server - The URL to the communication server. (ws://localhost:8000/)
     * @param pubKey - Public key of the instance that listens for new connections.
     */
    public async register(server: string, pubKey: string): Promise<void> {
        // create as many websockets as the spareConnections counter was set in the constructor
        for (let i = 0; i < this.spareConnections; i++) {
            await this.establishRegisteredConnection(server, pubKey);
        }
    }

    /**
     * Close all existing connections.
     */
    public shutDown(): void {
        // close waiting connections and remove them from the list
        this.waitingList.forEach((webSocket) => webSocket.close());
        this.waitingList = [];

        // close opened connections and remove them from the list
        this.openedConnections.forEach((webSocket) => webSocket.close());
        this.openedConnections = [];
    }

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
    public onChallenge: ((challenge: string, pubKey: string) => string) | null;
    /**
     * Handler for state change.
     *
     * When the state of the connector changes, this callback will be called
     * in order to have access from outside to the errors that occur on the
     * web socket level.
     */
    public onStateChange:
        | ((
              newState: CommServerConnectorStateType,
              oldState: CommServerConnectorStateType,
              reason?: string
          ) => void)
        | null;

    // ############ PRIVATE API ############

    /**
     * Creates a new web socket connection with the specified communication server
     * and starts the registration process.
     *
     * @param server - The URL to the communication server.
     * @param pubKey - Public key of the instance that listens for new connections.
     */
    private async establishRegisteredConnection(
        server: string,
        pubKey: string
    ): Promise<WebSocket> {
        this.changeCurrentState(CommServerConnectorStateType.Registering);
        // The known state of the communication server.
        let isServerAlive = false;

        // Create a web socket.
        const webSocket = new WebSocket(server);
        // Add the new created websocket to the waiting list until other instance.
        this.waitingList.push(webSocket);

        // Fired when a connection with a WebSocket is opened.
        webSocket.onopen = async () => {
            // Since the web socket connection has been oped the communication server is alive.
            isServerAlive = true;
            // Send register message to the communication server.
            await webSocket.send(
                JSON.stringify({
                    command: 'register',
                    pubKey
                })
            );
        };

        // Fired when a connection with a WebSocket has been closed
        // because of an error, such as when some data couldn't be sent.
        webSocket.onerror = (err) => {
            // When an error occurred, change state.
            this.changeCurrentState(
                CommServerConnectorStateType.NotListening,
                'web socket error:' + err
            );
        };

        // Fired when a connection with a WebSocket is closed.
        webSocket.onclose = () => {
            // When the web socket is closed, remove ot from the list where it was memorised.
            this.waitingList = this.waitingList.filter((ws) => ws !== webSocket);
            this.openedConnections = this.openedConnections.filter((ws) => ws !== webSocket);

            // The web socket is not connected to the communication server, so the connector is again in
            // the not listening state.
            this.changeCurrentState(CommServerConnectorStateType.NotListening, 'websocket closed');
        };

        // Fired when data is received through a WebSocket.
        webSocket.onmessage = async (event: MessageEvent) => {
            const message = JSON.parse(event.data as string) as InitialMessageType;

            // After the registration command was sent, the authentication should be done.
            if (message.command === 'authenticate' && message.response && message.pubKey) {
                // Here is called the onChallenge callback.
                if (this.onChallenge === null) {
                    this.changeCurrentState(
                        CommServerConnectorStateType.NotListening,
                        'onChallenge not specified'
                    );
                    return;
                }
                const reEncryptedString = this.onChallenge(message.response, message.pubKey);

                await webSocket.send(
                    JSON.stringify({
                        command: 'authenticate',
                        pubKey: pubKey,
                        response: reEncryptedString
                    })
                );
            }

            // The registration process has finished successfully and the listening is started.
            if (message.command === 'listening') {
                this.changeCurrentState(CommServerConnectorStateType.Listening);
                // Check every pingTimeout milliseconds if the communication server is still alive.
                this.pingCommServer(isServerAlive, webSocket);
            }

            // The connection with another instance has been established.
            if (message.command === 'connect') {
                // The web socket is removed from the waiting list.
                this.waitingList = this.waitingList.filter((ws) => ws !== webSocket);

                // If the onConnection callback was not specified, the connection is lost.
                if (this.onConnection === null) {
                    this.changeCurrentState(
                        CommServerConnectorStateType.NotListening,
                        'onConnection not specified'
                    );
                    return;
                }

                // If the onConnection callback was specified, the connection can be added in
                // the opened connection list and the onConnect callback is called for this
                // web socket.
                this.openedConnections.push(webSocket);
                this.onConnection(webSocket);

                // remove onmessage listener
                webSocket.onmessage = (event) => {};

                // Open a new connection after this one has been established with a partner.
                // IMPORTANT: No need to wait for the promises to return here, because this
                // connection should not stay blocked until the other one is established.
                this.establishRegisteredConnection(server, pubKey);
            }
        };

        setTimeout(() => {
            // If the registration process was not finished before reconnectTimeout has expired,
            // retry to connect to the comm server. The existing web socket is closed and the
            // process is re-started.
            // The reconnectTimeout is specified in connector constructor.
            if (
                this.communicationServerConnectorState === CommServerConnectorStateType.Registering
            ) {
                webSocket.close();
                this.waitingList = this.waitingList.filter((ws) => ws !== webSocket);
                this.establishRegisteredConnection(server, pubKey);
            }
        }, this.reconnectTimeout);

        webSocket.on('pong', () => {
            // When the communication server responds to the ping event, it is still available.
            isServerAlive = true;
            // Check again server state after pingTimeout milliseconds.
            this.pingCommServer(isServerAlive, webSocket);
        });

        return webSocket;
    }

    private pingCommServer(isServerAlive: boolean, webSocket: WebSocket) {
        setTimeout(() => {
            if (this.communicationServerConnectorState === CommServerConnectorStateType.Listening) {
                if (!isServerAlive) {
                    // The server did not respond to the ping request in 5 seconds, so
                    // the server is no longer online, and the web socket is closed.
                    webSocket.close();
                } else {
                    // As long as the connection isn't connected to another instance (so still listening)
                    // ping the server every pingTimeout milliseconds.
                    isServerAlive = false;
                    webSocket.ping();
                }
            }
        }, this.pingTimeout);
    }

    /**
     * When the state of the connector changes, call the onStateChange callback,
     * in order for the connector caller to be aware of the changes that happen
     * in the registration process.
     *
     * @param newState
     * @param reason
     */
    private changeCurrentState(newState: CommServerConnectorStateType, reason?: string): void {
        const oldState = this.communicationServerConnectorState;
        this.communicationServerConnectorState = newState;

        if (this.onStateChange) {
            this.onStateChange(newState, oldState, reason);
        }
    }

    /**
     * Number of waiting connections at a moment.
     */
    private readonly spareConnections: number;
    /**
     * Reconnect timeout.
     */
    private readonly reconnectTimeout: number;
    /**
     * Ping the server every pingTimeout milliseconds while in listening state.
     */
    private readonly pingTimeout: number;
    /**
     * List of web sockets which have both partner connected.
     */
    private openedConnections: WebSocket[];
    /**
     * List of opened web socket wich have no partner for moment.
     */
    private waitingList: WebSocket[];
    /**
     * Current connection state.
     */
    private communicationServerConnectorState: CommServerConnectorStateType;
}
