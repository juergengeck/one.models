import {InitialMessageType} from '../../lib/misc/CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';

export default class CommunicationServerConnector {
    constructor(spareConnections: number) {
        this.spareConnections = spareConnections;
        this.waitingList = new Array<WebSocket>(spareConnections);
        this.openedConnections = new Array<WebSocket>();
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
        // send register message to the communication server
        const registerMessage: InitialMessageType = {
            command: 'register',
            pubKey
        };

        // create a web socket
        const webSocket = new WebSocket(server);
        // add the new created websocket to the waiting list until other instance
        this.waitingList.push(webSocket);
        webSocket.onopen = async () => {
            await webSocket.send(JSON.stringify(registerMessage));
        };

        webSocket.onerror = (err) => console.error('web socket error:' + err);

        webSocket.onmessage = async (event: MessageEvent) => {
            const message = JSON.parse(event.data as string) as InitialMessageType;
            if (message.command === 'authenticate' && message.response && message.pubKey) {
                const reEncryptedString = this.onChallenge(message.response, message.pubKey);
                const authenticationMessage: InitialMessageType = {
                    command: 'authenticate',
                    pubKey: pubKey,
                    response: reEncryptedString
                };
                await webSocket.send(JSON.stringify(authenticationMessage));
            }
            if (message.command === 'connect') {
                this.onConnection(webSocket);
            }
        };
        return webSocket;
    }

    onConnection: (webSocket: WebSocket) => void;
    onChallenge: (challenge: string, pubKey: string) => string;

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

    private openedConnections: WebSocket[];

    private waitingList: WebSocket[];
}
