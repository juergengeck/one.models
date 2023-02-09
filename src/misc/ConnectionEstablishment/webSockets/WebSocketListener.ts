import WebSocketWS from 'isomorphic-ws';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import PromisePlugin from '../../Connection/plugins/PromisePlugin';
import {OEvent} from '../../OEvent';
import Connection from '../../Connection/Connection';

const MessageBus = createMessageBus('WebSocketListener');

export enum WebSocketListenerState {
    NotListening,
    Starting,
    Listening,
    ShuttingDown
}

/**
 * This is a listener for web socket connections.
 *
 * It wraps the Websocket.Server in a more convenient interface.
 */
class WebSocketListener {
    /**
     * Event is emitted on incoming connections.
     */
    public onConnection = new OEvent<(connection: Connection) => void>();

    /**
     * Event is emitted when the state of the connector changes. The listener callback
     * will be called in order to have access from outside to the errors that occur on
     * the web socket level.
     */
    public onStateChange = new OEvent<
        (
            newState: WebSocketListenerState,
            oldState: WebSocketListenerState,
            reason?: string
        ) => void
    >();

    public state: WebSocketListenerState; // Current connection state.
    private webSocketServer: WebSocketWS.Server | null = null; // The web socket server for listening for connections

    /**
     * Creates the listener.
     */
    constructor() {
        this.state = WebSocketListenerState.NotListening;
    }

    /**
     * Start the web socket listener.
     *
     * @param host - The host to listen on
     * @param port - The port to listen on
     */
    public async start(host: string, port: number): Promise<void> {
        if (this.webSocketServer) {
            throw Error('Communication server is already running.');
        }
        MessageBus.send('log', `Starting WebSocket server at ${host}:${port}`);
        this.changeCurrentState(WebSocketListenerState.Starting);

        try {
            this.webSocketServer = new WebSocketWS.Server({host, port});

            // Wait until the websocket server is either ready or stopped with an error (e.g. address in use)
            await new Promise<void>((resolve, reject) => {
                if (!this.webSocketServer) {
                    reject(
                        new Error(
                            'Web server instance not existing! This cannot happen, but TS demands this check'
                        )
                    );
                    return;
                }
                this.webSocketServer.on('listening', () => {
                    if (this.webSocketServer) {
                        this.webSocketServer.removeAllListeners();
                    }
                    resolve();
                });
                this.webSocketServer.on('error', (err: Error) => {
                    if (this.webSocketServer) {
                        this.webSocketServer.removeAllListeners();
                        this.webSocketServer = null;
                    }
                    reject(err);
                });
            });

            // After successful connection listen for new connections and errors
            this.webSocketServer.on('connection', this.acceptConnection.bind(this));
            this.webSocketServer.on('error', this.stop.bind(this));
            this.changeCurrentState(WebSocketListenerState.Listening);
            MessageBus.send('log', 'Successful started WebSocket server');
        } catch (e) {
            this.changeCurrentState(WebSocketListenerState.NotListening, e.toString());
            throw e;
        }
    }

    /**
     * Stops the listener
     */
    public async stop(): Promise<void> {
        MessageBus.send('log', 'Stopping WebSocket server');
        this.changeCurrentState(WebSocketListenerState.ShuttingDown);

        // Shutdown Websocket server
        await new Promise<void>(resolve => {
            if (!this.webSocketServer) {
                return;
            }

            this.webSocketServer.close(() => {
                this.webSocketServer = null;
                resolve(); // ignore errors. Stop should not throw.
            });
        });

        this.changeCurrentState(WebSocketListenerState.NotListening);
        MessageBus.send('log', 'Stopped WebSocket server');
    }

    /**
     * Notifies the user of a new connection.
     *
     * @param ws
     */
    private async acceptConnection(ws: WebSocket): Promise<void> {
        const connection = new Connection(ws);
        connection.addPlugin(new PromisePlugin());
        MessageBus.send('log', `${connection.id}: Accepted WebSocket`);
        try {
            this.onConnection.emit(connection);
        } catch (e) {
            MessageBus.send('log', `${connection.id}: ${e}`);
            ws.close();
        }
    }

    /**
     * When the state of the listener changes, call the onStateChange callback,
     * in order for the connector caller to be aware of the changes that happen
     * in the registration process.
     *
     * @param newState - The new state to set.
     * @param reason - The reason for the state change (Usually an error)
     */
    private changeCurrentState(newState: WebSocketListenerState, reason?: string): void {
        const oldState = this.state;
        this.state = newState;

        if (this.onStateChange.listenerCount() > 0 && newState != oldState) {
            try {
                this.onStateChange.emit(newState, oldState, reason);
            } catch (e) {
                MessageBus.send('log', `Error calling onStateChange handler: ${e}`);
            }
        }
    }
}

export default WebSocketListener;
