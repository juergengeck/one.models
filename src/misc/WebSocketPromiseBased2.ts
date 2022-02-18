import {createMessageBus} from '../message-bus';
import {OEvent} from './OEvent';

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
export default class WebSocketPromiseBased {
    /**
     * Event is emitted when a new message is received.
     */
    public onMessage = new OEvent<(messageEvent: MessageEvent) => void>();

    public readonly id: number;
    public webSocket: WebSocket | null;
    public defaultTimeout: number;
    private dataQueue: MessageEvent[];
    private socketOpenFn: ((err?: Error) => void) | null;
    private dataAvailableFn: ((err?: Error) => void) | null;
    private readonly maxDataQueueSize: number;
    private readonly deregisterHandlers: () => void;
    private dataQueueOverflow: boolean;
    private disableWaitForMessageInt: boolean;
    private closeReason: string;
    private firstError: string;
    private lastError: string;
    private static idCounter: number = 0;

    /**
     * Construct a new connection - at the moment based on WebSockets
     * @param webSocket
     * @param maxDataQueueSize
     */
    constructor(webSocket: WebSocket, maxDataQueueSize = 10) {
        this.id = ++WebSocketPromiseBased.idCounter;
        this.webSocket = webSocket;
        this.dataQueue = [];
        this.socketOpenFn = null;
        this.dataAvailableFn = null;
        this.maxDataQueueSize = maxDataQueueSize;
        this.dataQueueOverflow = false;
        this.defaultTimeout = -1;
        this.disableWaitForMessageInt = false;
        this.closeReason = '';
        this.firstError = '';
        this.lastError = '';

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

        MessageBus.send('debug', `${this.id}: constructor()`);
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
     * All handlers are de-registered, the rest is left as-is.
     *
     * Attention: If messages arrive in the meantime they might get lost.
     *            Usually it is better to pass around the WebSocketPromiseBased
     *            instance, because it buffers messages that arrive in the time
     *            until new handlers are registered.
     */
    public releaseWebSocket(): WebSocket {
        MessageBus.send('debug', `${this.id}: releaseWebSocket()`);

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
     *
     * This function waits for the other side to also close the Tcp connection
     * by responding with a FIN package. This might lead to a delay if the
     * connection was interrupted because e.g. the wireless adapter was switched
     * off.
     *
     * @param {string} reason - Reason for timeout
     */
    public close(reason?: string): void {
        MessageBus.send('debug', `${this.id}: close(${reason})`);

        if (this.webSocket) {
            if (this.webSocket.readyState !== WebSocket.OPEN) {
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
     * Terminates the connection immediately without waiting for the Tcp FIN handshake.
     *
     * This function terminates the readers immediately instead of waiting for the
     * other side to also close the websocket by sending the Tcp FIN package. This
     * function should only be used when a connection loss is detected (PING / PONG
     * timeout)
     *
     * This also releases the websocket, because the state might still be open, but
     * we don't want anyone to do any operation on the websocket anymore.
     *
     * @param {string} reason - Reason for timeout
     */
    public terminate(reason?: string) {
        MessageBus.send('debug', `${this.id}: terminate(${reason})`);

        if (this.webSocket) {
            if (this.webSocket.readyState !== WebSocket.OPEN) {
                return;
            }

            // Close the websocket
            if (reason) {
                this.webSocket.close(1000, reason);
            } else {
                this.webSocket.close();
            }

            // Notify the read handler and therefore immediately unblock any blocked read operations
            this.closeReason = reason ? reason : 'Connection terminated locally';

            if (this.dataAvailableFn) {
                this.dataAvailableFn(new Error('Connection was closed: ' + reason));
            }

            if (this.socketOpenFn) {
                this.socketOpenFn(new Error('Connection was closed: ' + reason));
            }

            // for now releasing websocket becomes null and throws and error no websocket assigned to connection
            // Release the websocket, so that nobody can accidentally use it while it waits for the FIN
            // this.releaseWebSocket();
        }
    }

    /**
     * Wait for the socket to be open.
     * @param timeout
     */
    public async waitForOpen(timeout: number = -2): Promise<void> {
        MessageBus.send('debug', `${this.id}: waitForOpen()`);

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

    /**
     * Send data to the websocket.
     * @param data
     */
    public async send(data: any): Promise<void> {
        MessageBus.send('debug', `${this.id}: send(${JSON.stringify(data)})`);
        return new Promise((resolve, reject) => {
            if (!this.webSocket) {
                reject(new Error('No websocket is bound to this instance.'));
                return;
            }

            try {
                this.assertOpen();
                this.webSocket.send(data);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    // ######## Receiving messages ########

    /**
     * Wait for an incoming message with a specific type for a specified period of time.
     *
     * @param {string} type -    - The type field of the message should have this type.
     * @param {string} typekey - The name of the member that holds the type that is checked for equality
     *                           with the type param.
     * @param {number} timeout - Number of msecs to wait for the message. -1 to wait forever
     * @returns Promise<WebSocket.MessageEvent['data']> The promise will resolve when a value was received.
     *                                                 - The value will be the JSON.parsed object
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
     * @param {number} timeout - Number of msecs to wait for the message. -1 to wait forever
     * @returns Promise<any> The promise will resolve when a value was received.
     *                      The value will be the JSON.parsed object
     *                      The promise will reject when
     *                      1) the timeout expired
     *                      2) the connection was closed
     *                      3) the type of the received message doe not match parameter
     *                         'type'
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
     * @returns Promise<WebSocket.MessageEvent['data']> The promise will resolve when a value was received.
     *                                                 The promise will reject when
     *                                                 1) the timeout expired
     *                                                 2) the connection was closed
     */
    public async waitForMessage(timeout: number = -2): Promise<MessageEvent['data']> {
        MessageBus.send('debug', `${this.id}: waitForMessage(${timeout})`);

        if (timeout === -2) {
            timeout = this.defaultTimeout;
        }

        return new Promise((resolve, reject) => {
            try {
                // Check prerequisites (Websocket exists & nobody is listening & no overflow)
                if (!this.webSocket) {
                    reject(new Error('No websocket is bound to this instance.'));
                    return;
                }

                if (this.dataAvailableFn) {
                    reject(Error('Another call is already waiting for a message.'));
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

                if (this.dataQueue.length > 0) {
                    // If we have data in the queue, then resolve with the first element
                    const data = this.dataQueue.shift();

                    if (data === undefined) {
                        reject(
                            new Error(
                                'Internal error: Queue is empty, but dataAvailable event happened.'
                            )
                        );
                    } else {
                        resolve(data.data);
                    }

                    return;
                } else {
                    // If we have no data in the queue, start the timer and wait for a message
                    this.assertOpen();

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
                        const data = this.dataQueue.shift();

                        if (data === undefined) {
                            reject(
                                new Error(
                                    'Internal error: Queue is empty, but dataAvailable event happened.'
                                )
                            );
                        } else {
                            resolve(data.data);
                        }
                    };
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    // ######## Private API ########

    /**
     * This function handles the web sockets open event
     *
     * It notifies any waiting reader.
     *
     * @param openEvent
     */
    private handleOpen(openEvent: unknown) {
        MessageBus.send('debug', `${this.id}: handleOpen()`);

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
    private handleMessage(messageEvent: MessageEvent) {
        MessageBus.send('debug', `${this.id}: handleMessage(${messageEvent.data})`);

        // Notify listeners for a new message
        this.onMessage.emit(messageEvent);

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
     * Function asserts that the connection is open.
     *
     * If it is closed it will reject the promise with a message having the close reason.
     *
     * @returns {Promise<void>}
     */
    private assertOpen(): void {
        if (!this.webSocket) {
            throw new Error('No websocket is bound to this instance.');
        }

        if (this.webSocket.readyState !== WebSocket.OPEN) {
            let errorMessage = 'The websocket is closed.';

            if (this.closeReason !== '') {
                errorMessage += ` Close Reason: '${this.closeReason}'.`;
            }

            if (this.firstError !== '') {
                errorMessage += ` First Error: '${this.firstError}'.`;
            }

            if (this.lastError !== '') {
                errorMessage += ` Last Error: '${this.lastError}'.`;
            }
            throw new Error(errorMessage);
        }
    }

    /**
     * This function handles the websockets close event
     *
     * It notifies any waiting reader.
     *
     * @param closeEvent
     */
    private handleClose(closeEvent: CloseEvent) {
        MessageBus.send('debug', `${this.id}: handleClose()`);
        this.closeReason = closeEvent.reason;

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
     * @param errorEvent
     */
    private handleError(errorEvent: Event) {
        MessageBus.send('debug', `${this.id}: handleError()`);
        const errMessage = (errorEvent as any).message && 'unkown error';

        if (this.firstError === '') {
            this.firstError = errMessage;
        } else {
            this.lastError = errMessage;
        }

        if (this.dataAvailableFn) {
            this.dataAvailableFn(new Error(errMessage));
        }

        if (this.socketOpenFn) {
            this.socketOpenFn(new Error(errMessage));
        }
    }
}
