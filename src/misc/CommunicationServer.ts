import {Server as WebSocketServer, default as WebSocket} from 'ws';

/**
 * This class implements the communication server.
 */
export default class CommunicationServer {
    /**
     * Constructor for the CommunicationServer
     */
    constructor() {
        this.registeredConnections = new Map<string, WebSocket[]>();
    }

    /**
     * Start the communication server.
     *
     * It is possible to use the same port for registering and
     * incoming connections
     */
    public start(url: string): Promise<void> {}

    /**
     * Stop the communication server
     *
     * This terminates all connections and shuts the server down.
     */
    public stop(): Promise<void> {}

    // ############ PRIVATE API ############

    private acceptNewConnection() {
        // set onmessage to parseIntitialMessage;
        // handle onclose and other stuff correctly
        // -> disconnecting the corresponding peer if it was connected
        // -> removing it from the registeredConnections if it was not connected
    }

    /**
     * This is a web socket onmessage handler that handles messages from newly established connections.
     *
     * It determines whether it is a listening connection or if it is a connection attempt to a listening connection
     */
    private parseInitialMessage() {
        // If register command with pub key
        // -> challenge response
        // -> set onmessage to respondWithError
        // -> add ws to registeredConnections

        // If connect with pub key command
        // -> check in registeredConnections for a suitable connection
        // -> if found
        //   -> send a (tbd) message to suitable connection and remove it from registeredConnections
        //   -> set onmessage on both connections to forwardMessage (binding the first argument to the other peer)
    }

    /**
     * This is a web socket message handler that is registered when receiving a message is unexpected.
     *
     * It will return an error message to the sender.
     */
    private respondWithError(event) {
        // return error to client (perhaps close connection and deregister it?)
    }

    /**
     * This is a web socket message handler that forwards messages to another web socket connection.
     *
     * It will return an error message to the sender.
     */
    private forwardMessage(forwardTo: WebSocket, event) {
        // forward message to forwardTo client
    }

    /**
     * Stores registered web sockets that are still available to be allocated to an incoming connection.
     */
    private registeredConnections: Map<string, WebSocket[]>;
}
