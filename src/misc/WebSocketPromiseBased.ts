import WebSocket from 'isomorphic-ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import {EventEmitter} from 'events';
import {WebSocketPromiseBasedInterface} from 'one.core/lib/websocket-promisifier';
const MessageBus = createMessageBus('WebSocketPromiseBased');

/**
 * This class is a wrapper for web sockets, that allows to receive messages with async / await
 * instead of using callbacks (onmessage onopen ...)
 *
 * It also has a on('message') event, because sometimes you just need it. When you solely use the
 * event based interface, and don't use the waitForMessage functions, then you need to set
 * disableWaitForMessage to true, because otherwise you will get an error that you didn't collect
 * incoming messages with waitFor... functions.
 */
export default class WebSocketPromiseBased extends EventEmitter
    implements WebSocketPromiseBasedInterface {
    public webSocket: WebSocket | null;
    public defaultTimeout: number;
    private dataQueue: WebSocket.MessageEvent[];
    private socketOpenFn: ((err?: Error) => void) | null;
    private dataAvailableFn: ((err?: Error) => void) | null;
    private maxDataQueueSize: number;
    private deregisterHandlers: () => void;
    private dataQueueOverflow: boolean;
    private disableWaitForMessageInt: boolean;

    /**
     * Construct a new connection - at the moment based on WebSockets
     */
    constructor(webSocket: WebSocket, maxDataQueueSize = 1) {
        super();
        this.webSocket = webSocket;
        this.dataQueue = [];
        this.socketOpenFn = null;
        this.dataAvailableFn = null;
        this.maxDataQueueSize = maxDataQueueSize;
        this.dataQueueOverflow = false;
        this.defaultTimeout = -1;
        this.disableWaitForMessageInt = false;

        // Configure for binary messages
        this.webSocket.binaryType = 'arraybuffer';

        // configure websocket callbacks
        const boundOpenHandler = this.handleOpen.bind(this);
        const boundMessageHandler = this.handleMessage.bind(this);
        const boundCloseHandler = this.handleClose.bind(this);
        const boundErrorHandler = this.handleError.bind(this);
        this.webSocket.addEventListener('open', boundOpenHandler);
        this.webSocket.addEventListener('message', boundMessageHandler);
        this.webSocket.addEventListener('close', boundCloseHandler);
        this.webSocket.addEventListener('error', boundErrorHandler);
        this.deregisterHandlers = () => {
            if (this.webSocket) {
                this.webSocket.removeEventListener('open', boundOpenHandler);
                this.webSocket.removeEventListener('message', boundMessageHandler);
                this.webSocket.removeEventListener('close', boundCloseHandler);
                this.webSocket.removeEventListener('error', boundErrorHandler);
            }
        };

        MessageBus.send('debug', `${wslogId(this.webSocket)}: constructor()`);
    }

    // ######## Socket Management & Settings ########
    /**
     * Disables the waitForMessage functions.
     *
     * This is required, if you only want to use the event based interface for retrieving messages.
     *
     * @param {boolean} value
     */
    public set disableWaitForMessage(value: boolean) {
        this.disableWaitForMessageInt = value;
        if (this.disableWaitForMessage) {
            if (this.dataAvailableFn) {
                this.dataAvailableFn(Error('Waiting for incoming messages has been disabled.'));
            }
        }
    }

    /**
     * Get the waitForMessage state
     *
     * @returns {boolean}
     */
    public get disableWaitForMessage(): boolean {
        return this.disableWaitForMessageInt;
    }

    /**
     * Releases the websocket from this class.
     *
     * All handlers are deregistered, the rest is left as-is.
     */
    public releaseWebSocket(): WebSocket {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: releaseWebSocket()`);
        if (!this.webSocket) {
            throw Error('No websocket is bound to this instance.');
        }

        this.deregisterHandlers();
        const webSocket = this.webSocket;
        this.webSocket = null;
        return webSocket;
    }

    /**
     * Closes the underlying websocket.
     */
    public close(reason?: string) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: close(${reason})`);
        if (this.webSocket) {
            if(this.webSocket.readyState !== WebSocket.OPEN){
                return;
            }
            if (reason) {
                this.webSocket.close(1000, reason);
            } else {
                this.webSocket.close();
            }
        }
    }

    /**
     * Wait for the socket to be open.
     */
    public async waitForOpen(timeout: number = -2): Promise<void> {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: waitForOpen()`);
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
                const timeoutHandle =
                    timeout > -1
                        ? setTimeout(() => {
                              reject(new Error('Timeout expired'));
                              this.socketOpenFn = null;
                          }, timeout)
                        : null;

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
                        reject(
                            new Error(
                                'Internal error: Websocket is not open, but open event happened.'
                            )
                        );
                    }
                };
            }
        });
    }

    // ######## Sending messages ########

    /** Send data to the websocket. */
    public async send(data: any): Promise<void> {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: send(${JSON.stringify(data)})`);
        return new Promise((resolve, reject) => {
            if (!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }

            if(this.webSocket.readyState !== WebSocket.OPEN){
                reject(new Error('The websocket is CLOSED.'));
                return;
            }

            this.webSocket.send(data);
            resolve();
        });
    }

    // ######## Receiving messages ########

    /**
     * Wait for an incoming message with a specific type for a specified period of time.
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
    public async waitForJSONMessageWithType(
        type: string,
        typekey: string = 'type',
        timeout: number = -2
    ): Promise<any> {
        const messageObj = await this.waitForJSONMessage(timeout);

        // Assert that is has a 'type' member
        if (!messageObj.hasOwnProperty(typekey)) {
            throw new Error(`Received message without a \'${typekey}\' member.`);
        }

        // Assert that the type matches the requested one
        if (messageObj[typekey] !== type) {
            throw new Error(
                `Received unexpected type '${messageObj[typekey]}'. Expected type '${type}'.`
            );
        }

        return messageObj;
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
    public async waitForJSONMessage(timeout: number = -2): Promise<any> {
        const message = await this.waitForMessage(timeout);

        // Assert that we received a string based message
        if (typeof message !== 'string') {
            throw new Error('Received message that is not a string.');
        }

        // Convert from JSON to Object
        let messageObj;
        try {
            messageObj = JSON.parse(message);
        } catch (e) {
            throw new Error('Received message that does not conform to JSON: ' + e.toString());
        }

        return messageObj;
    }

    /**
     * Wait for a binary message.
     *
     * @param {number} timeout
     * @returns {Promise<Uint8Array>}
     */
    public async waitForBinaryMessage(timeout: number = -2): Promise<Uint8Array> {
        const message = await this.waitForMessage(timeout);
        if (!(message instanceof ArrayBuffer)) {
            throw new Error('Received message that is not a binary message.');
        }
        return new Uint8Array(message);
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
        MessageBus.send('debug', `${wslogId(this.webSocket)}: waitForMessage(${timeout})`);
        if (timeout === -2) {
            timeout = this.defaultTimeout;
        }

        return new Promise((resolve, reject) => {
            // Check prerequisites (Websocket exists & nobody is listening & no overflow)
            if (!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }
            if (this.dataAvailableFn) {
                reject(Error('Another call is already wating for a message.'));
                return;
            }
            if (this.dataQueueOverflow) {
                reject(Error('The incoming message data queue overflowed.'));
                return;
            }
            if (this.disableWaitForMessage) {
                reject(Error('Waiting for incoming messages was disabled.'));
                return;
            }

            // If we have data in the queue, then resolve with the first element
            if (this.dataQueue.length > 0) {
                let data = this.dataQueue.shift();
                if (data !== undefined) {
                    resolve(data.data);
                } else {
                    reject(
                        new Error(
                            'Internal error: Queue is empty, but dataAvailable event happened.'
                        )
                    );
                }
                return;
            }

            // If we have no data in the queue, start the timer and wait for a message
            else {
                // Start the timeout for waiting on a new message
                const timeoutHandle =
                    timeout > -1
                        ? setTimeout(() => {
                              reject(new Error('Timeout expired'));
                              this.dataAvailableFn = null;
                          }, timeout)
                        : null;

                // Register the dataAvailable handler that is called when data is available
                this.dataAvailableFn = (err: Error | undefined) => {
                    // Stop the timer and deregister the handler, so that it is not called again
                    if (timeoutHandle) {
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
                    if (data !== undefined) {
                        resolve(data.data);
                    } else {
                        reject(
                            new Error(
                                'Internal error: Queue is empty, but dataAvailable event happened.'
                            )
                        );
                    }
                };
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
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleOpen()`);

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
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleMessage(${messageEvent.data})`);

        // Notify listeners for a new message
        this.emit('message', messageEvent);

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
     * @param closeEvent
     */
    private handleClose(closeEvent: WebSocket.CloseEvent) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleClose()`);
        if (this.dataAvailableFn) {
            this.dataAvailableFn(new Error('Connection was closed: ' + closeEvent.reason));
        }
        if (this.socketOpenFn) {
            this.socketOpenFn(new Error('Connection was closed: ' + closeEvent.reason));
        }
    }

    /**
     * This function handles the websockets error event
     *
     * It notifies any waiting reader.
     *
     * @param closeEvent
     */
    private handleError(errorEvent: WebSocket.ErrorEvent) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleError()`);
        if (this.dataAvailableFn) {
            this.dataAvailableFn(errorEvent.error);
        }
        if (this.socketOpenFn) {
            this.socketOpenFn(errorEvent.error);
        }
    }
}