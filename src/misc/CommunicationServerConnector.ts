import {InitialMessageType} from './CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';

enum CommServerConnectorStateType {
    NotListening,
    Registering,
    Listening
}

export default class CommunicationServerConnector {
    constructor(spareConnections: number, reconnectTimeout: number) {
        this.spareConnections = spareConnections;
        this.waitingList = new Array<WebSocket>(spareConnections);
        this.openedConnections = new Array<WebSocket>();
        this.onConnection = null;
        this.onChallenge = null;
        this.onStateChange = null;
        this.communicationServerConnectorState = CommServerConnectorStateType.NotListening;
        this.reconnectTimeout = reconnectTimeout;
    }

    /**
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

    async establishRegisteredConnection(server: string, pubKey: string): Promise<WebSocket> {
        this.changeCurrentState(CommServerConnectorStateType.Registering);

        // create a web socket
        const webSocket = new WebSocket(server);
        // add the new created websocket to the waiting list until other instance
        this.waitingList.push(webSocket);

        webSocket.onopen = async () => {
            // send register message to the communication server
            await webSocket.send(
                JSON.stringify({
                    command: 'register',
                    pubKey
                })
            );
        };

        webSocket.onerror = (err) => {
            this.changeCurrentState(
                CommServerConnectorStateType.NotListening,
                'web socket error:' + err
            );
            // console.error('web socket error:' + err);
        };

        webSocket.onmessage = async (event: MessageEvent) => {
            const message = JSON.parse(event.data as string) as InitialMessageType;
            if (message.command === 'authenticate' && message.response && message.pubKey) {
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
            if (message.command === 'listening') {
                this.changeCurrentState(CommServerConnectorStateType.Listening);
            }
            if (message.command === 'connect') {
                if (this.onConnection === null) {
                    this.changeCurrentState(
                        CommServerConnectorStateType.Listening,
                        'onConnection not specified'
                    );
                    return;
                }
                this.openedConnections.push(webSocket);
                this.waitingList = this.waitingList.filter((ws) => ws !== webSocket);
                this.onConnection(webSocket);

                // open a new connection after this one has been established with a partner
                this.establishRegisteredConnection(server, pubKey);
            }
        };

        setTimeout(() => {
            if (
                this.communicationServerConnectorState === CommServerConnectorStateType.Registering
            ) {
                webSocket.close();
                this.waitingList = this.waitingList.filter((ws) => ws !== webSocket);
                this.establishRegisteredConnection(server, pubKey);
            }
        }, this.reconnectTimeout);

        return webSocket;
    }

    private changeCurrentState(newState: CommServerConnectorStateType, reason?: string): void {
        const oldState = this.communicationServerConnectorState;
        this.communicationServerConnectorState = newState;

        if (this.onStateChange) {
            this.onStateChange(newState, oldState, reason);
        }
    }

    onConnection: ((webSocket: WebSocket) => void) | null;
    onChallenge: ((challenge: string, pubKey: string) => string) | null;
    onStateChange:
        | ((
              newState: CommServerConnectorStateType,
              oldState: CommServerConnectorStateType,
              reason?: string
          ) => void)
        | null;

    /**
     * Close all existing connections.
     */
    public shutDown(): void {
        this.waitingList.forEach((webSocket) => webSocket.close());
        this.openedConnections.forEach((webSocket) => webSocket.close());
    }

    /**
     * Number of waiting connections at a moment.
     */
    private readonly spareConnections: number;
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
    /**
     * Reconnect timeout.
     */
    private reconnectTimeout: number;
}
