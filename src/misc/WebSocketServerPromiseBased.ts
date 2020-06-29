import WebSocket from "ws";

/**
 * This is a wrapper for the web socket server to use it with async / await instead of having to
 * register callbacks.
 *
 * Note: At the moment this class is just used in testcases, so itself doesn't have tests and is
 * not production ready!
 */
export default class WebSocketServerPromiseBased {
    public webSocketServer: WebSocket.Server | null;
    private acceptConnectionFn: (() => void) | null;
    private lastConnection: WebSocket | null;
    private deregisterHandlers: () => void;

    public constructor(webSocketServer: WebSocket.Server) {
        this.acceptConnectionFn = null;
        this.lastConnection = null;
        this.webSocketServer = webSocketServer;

        const boundConnectionHandler = this.handleConnection.bind(this);
        this.webSocketServer.on('connection', boundConnectionHandler);
        this.deregisterHandlers = () => {
            if(this.webSocketServer) {
                this.webSocketServer.removeListener('connection', boundConnectionHandler);
            }
        }
    }

    public releaseWebSocketServer(): WebSocket.Server {
        if (!this.webSocketServer) {
            throw Error('No websocket is bound to this instance.');
        }

        this.deregisterHandlers();
        const webSocket = this.webSocketServer;
        this.webSocketServer = null;
        return webSocket;
    }

    public async waitForConnection(): Promise<WebSocket> {
        if (this.acceptConnectionFn) {
            throw new Error('Somebody else is already waiting for a connection.');
        }

        // Return connection if any is available.
        if (this.lastConnection) {
            const lastConnection = this.lastConnection;
            this.lastConnection = null;
            return lastConnection;
        }

        // Otherwise wait for a connection to be established
        return new Promise((resolve, reject) => {
            this.acceptConnectionFn = () => {
                this.acceptConnectionFn = null;
                if (this.lastConnection) {
                    const lastConnection = this.lastConnection;
                    this.lastConnection = null;
                    resolve(lastConnection);
                }
            }
        });
    }

    private handleConnection(ws: WebSocket) {
        // Add connection to member, so that it can be obtained by waitForConnection
        if(this.lastConnection) {
            console.log('Warning: An established connection was ignored!');
        }
        this.lastConnection = ws;

        // Notify waitForConnection that a new connection was received
        if(this.acceptConnectionFn) {
            this.acceptConnectionFn();
        }
    }
}

