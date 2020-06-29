import WebSocket from 'ws';

/**
 * This class is a wrapper for web sockets, that allows to receive messages with async / await
 * instead of using callbacks (onmessage onopen ...)
 */
export default class WebSocketPromiseBased {

    public webSocket: WebSocket | null;
    private dataQueue: WebSocket.MessageEvent[];
    private socketOpenFn: ((err?: Error) => void) | null;
    private dataAvailableFn: ((err?: Error) => void) | null;
    private maxDataQueueSize: number;
    private deregisterHandlers: () => void;
    private dataQueueOverflow: boolean;
    private defaultTimeout: number;

    /**
     * Construct a new connection - at the moment based on WebSockets
     */
    constructor(webSocket: WebSocket, maxDataQueueSize = 1) {
        this.webSocket = webSocket;
        this.dataQueue = [];
        this.socketOpenFn = null;
        this.dataAvailableFn = null;
        this.maxDataQueueSize = maxDataQueueSize;
        this.dataQueueOverflow = false;
        this.defaultTimeout = 500;

        // configure websocket callbacks
        const boundOpenHandler = this.handleOpen.bind(this);
        const boundMessageHandler = this.handleMessage.bind(this);
        const boundCloseHandler = this.handleCloseEvent.bind(this);
        this.webSocket.addEventListener('open', boundOpenHandler);
        this.webSocket.addEventListener('message', boundMessageHandler);
        this.webSocket.addEventListener('close', boundCloseHandler);
        this.deregisterHandlers = () => {
            if(this.webSocket) {
                this.webSocket.removeEventListener('open', boundOpenHandler);
                this.webSocket.removeEventListener('message', boundMessageHandler);
                this.webSocket.removeEventListener('close', boundCloseHandler);
            }
        }

    }

    /**
     * Releases the websocket from this class.
     *
     * All handlers are deregistered, the rest is left as-is.
     */
    public releaseWebSocket(): WebSocket {
        if(!this.webSocket) {
            throw Error('No websocket is bound to this instance.');
        }

        this.deregisterHandlers();
        const webSocket = this.webSocket;
        this.webSocket = null;
        return webSocket;
    }

    /** Send data to the websocket. */
    public async send(data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if(!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }

            this.webSocket.send(data, (err: Error | undefined) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(err);
                }
            });
        });
    }

    /**
     * Wait for the socket to be open.
     */
    public async waitForOpen(timeout: number = -2): Promise<void> {
        if (timeout === -2) {
            timeout = this.defaultTimeout;
        }

        return new Promise((resolve, reject) => {

            // Check prerequisites (Websocket exists & nobody is listening & not already open)
            if (!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }
            if (this.socketOpenFn) {
                reject(Error('Another call is already wating for the socket to open.'));
                return;
            }

            // If already open, then just return
            if (this.webSocket.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            // Wait for the open event
            // Start the timeout for waiting on a new message
            else {
                const timeoutHandle = (timeout > -1) ? setTimeout(() => {
                    reject(new Error('Timeout expired'));
                    this.socketOpenFn = null;
                }, timeout) : null;


                // Register the dataAvailable handler that is called when data is available
                this.socketOpenFn = (err: Error | undefined) => {

                    // Stop the timer and deregister the handler, so that it is not called again
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    this.socketOpenFn = null;

                    // Reject when error happened
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Check again that the websocket is still valid.
                    if (!this.webSocket) {
                        reject(new Error('No websocket is bound to this instance.'));
                        return;
                    }

                    // Resolve first element in array
                    if (this.webSocket.readyState === WebSocket.OPEN) {
                        resolve();
                    } else {
                        reject(new Error('Internal error: Websocket is not open, but open event happened.'))
                    }
                }
            }
        });

    }

    /**
     * Wait for an incoming message for a specified period of time.
     *
     * @param {string} type    - The type field of the message should have this type.
     * @param {number} timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return Promise<WebSocket.MessageEvent['data']> The promise will resolve when a value was received.
     *                                                 - The value will be the JSON.parse'd object
     *                                                 The promise will reject when
     *                                                 1) the timeout expired
     *                                                 2) the connection was closed
     *                                                 3) the type of the received message doe not match parameter
     *                                                    'type'
     */
    public async waitForMessageWithType(type: string, timeout: number = -2): Promise<any> {
        const message = await this.waitForMessage(timeout);

        // Assert that we received a string based message
        if (typeof message !== 'string') {
            throw new Error('Received message that is not a string.');
        }

        // Convert from JSON to Object
        let messageObj;
        try {
            messageObj = JSON.parse(message);
        }
        catch(e) {
            throw new Error('Received message that does not conform to JSON: ' + e.toString());
        }

        // Assert that is has a 'type' member
        if (!messageObj.hasOwnProperty('type')) {
            throw new Error('Received message without a \'type\' member.');
        }

        // Assert that the type matches the requested one
        if (messageObj.type !== type) {
            throw new Error(`Received unexpected type '${messageObj.type}'. Expected type '${type}'.`);
        }

        return messageObj;
    }

    /**
     * Wait for an incoming message for a specified period of time.
     *
     * @param {number} timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return Promise<WebSocket.MessageEvent['data']> The promise will resolve when a value was received.
     *                                                 The promise will reject when
     *                                                 1) the timeout expired
     *                                                 2) the connection was closed
     */
    public async waitForMessage(timeout: number = -2): Promise<WebSocket.MessageEvent['data']> {
        if (timeout === -2) {
            timeout = this.defaultTimeout;
        }

        return new Promise((resolve, reject) => {

            // Check prerequisites (Websocket exists & nobody is listening & no overflow)
            if(!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }
            if(this.dataAvailableFn) {
                reject(Error('Another call is already wating for a message.'));
                return;
            }
            if(this.dataQueueOverflow) {
                reject(Error('The incoming message data queue overflowed.'));
                return;
            }

            // If we have data in the queue, then resolve with the first element
            if (this.dataQueue.length > 0) {
                let data = this.dataQueue.shift();
                if(data !== undefined) {
                    resolve(data.data);
                }
                else {
                    reject(new Error('Internal error: Queue is empty, but dataAvailable event happened.'))
                }
                return;
            }

            // If we have no data in the queue, start the timer and wait for a message
            else {

                // Start the timeout for waiting on a new message
                const timeoutHandle = (timeout > -1) ? setTimeout(() => {
                    reject(new Error('Timeout expired'));
                    this.dataAvailableFn = null;
                }, timeout) : null;

                // Register the dataAvailable handler that is called when data is available
                this.dataAvailableFn = (err: Error | undefined) => {

                    // Stop the timer and deregister the handler, so that it is not called again
                    if(timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                    this.dataAvailableFn = null;

                    // Reject when error happened
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Resolve first element in array
                    let data = this.dataQueue.shift();
                    if(data !== undefined) {
                        resolve(data.data);
                    }
                    else {
                        reject(new Error('Internal error: Queue is empty, but dataAvailable event happened.'))
                    }
                }
            }

        });
    }

    // ######## Private API ########

    /**
     * This function handles the web sockets open event
     *
     * It notifies any waiting reader.
     *
     * @param messageEvent
     */
    private handleOpen(openEvent: WebSocket.OpenEvent) {

        // Wakeup the reader in waitForOpen if somebody waits
        if (this.socketOpenFn) {
            this.socketOpenFn();
        }
    }

    /**
     * This function handles the web sockets message event
     *
     * It enqueues the data and notifies any waiting reader.
     *
     * @param messageEvent
     */
    private handleMessage(messageEvent: WebSocket.MessageEvent) {

        // If the queue is full, then we reject the next reader
        if (this.dataQueue.length >= this.maxDataQueueSize) {
            this.dataQueueOverflow = true;
            if (this.dataAvailableFn) {
                this.dataAvailableFn(Error('The incoming message data queue overflowed.'));
            }
            return;
        }

        // Enqueue message
       this.dataQueue.push(messageEvent);

        // Wakeup the reader in waitForMessage if somebody waits
        if (this.dataAvailableFn) {
            this.dataAvailableFn();
        }
    }

    /**
     * This function handles the websockets close event
     *
     * It notifies any waiting reader.
     *
     * @param messageEvent
     */
    private handleCloseEvent(closeEvent: WebSocket.CloseEvent) {
        if (this.dataAvailableFn) {
            this.dataAvailableFn(new Error('Connection was closed: ' + closeEvent.reason));
        }
    }

}
