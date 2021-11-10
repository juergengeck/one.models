import WebSocketWS from 'isomorphic-ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import {EventEmitter} from 'events';
import type {WebSocketPromiseBasedInterface} from 'one.core/lib/websocket-promisifier';
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
export default class WebSocketPromiseBased
    extends EventEmitter
    implements WebSocketPromiseBasedInterface
{
    /**
     * Event is emitted when a new message is received.
     */
    public onMessage = new OEvent<(messageEvent: MessageEvent) => void>();

    // @ts-ignore
    public webSocket: WebSocket | null;
    public defaultTimeout: number;
    private dataQueue: MessageEvent[];
    private socketOpenFn: ((err?: Error) => void) | null;
    private dataAvailableFn: ((err?: Error) => void) | null;
    private maxDataQueueSize: number;
    private deregisterHandlers: () => void;
    private dataQueueOverflow: boolean;
    private disableWaitForMessageInt: boolean;
    private closeReason: string;
    private firstError: string;
    private lastError: string;
    private pingInterval: number;
    private pongTimeout: number;
    private isPinging: boolean = false; // State that indicates if the ping process is running
    // while waiting for a pong
    private pingTimeoutHandle: ReturnType<typeof setTimeout> | null = null; // Ping timout handle for cancellation in stop
    private onPong = new OEvent<() => void>();
    private onStopPingPong = new OEvent<() => void>();

    /**
     * Construct a new connection - at the moment based on WebSockets
     */
    constructor(
        webSocket: WebSocket,
        maxDataQueueSize = 10,
        pingInterval = 30000,
        pongTimeout = 3000
    ) {
        super();
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
        this.pingInterval = pingInterval;
        this.pongTimeout = pongTimeout;

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
     * @param value
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
     * @returns
     */
    public get disableWaitForMessage(): boolean {
        return this.disableWaitForMessageInt;
    }

    /**
     * Releases the websocket from this class.
     *
     * All handlers are deregistered, the rest is left as-is.
     *
     * Attention: If messages arrive in the meantime they might get lost.
     *            Usually it is better to pass around the WebSocketPromiseBased
     *            instance, because it buffers messages that arrive in the time
     *            until new handlers are registered.
     */
    public releaseWebSocket(): WebSocket {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: releaseWebSocket()`);
        if (!this.webSocket) {
            throw Error('No websocket is bound to this instance.');
        }

        this.deregisterHandlers();
        const webSocket = this.webSocket;
        this.webSocket = null;
        this.stopPingPong();
        return webSocket;
    }

    /**
     * Closes the underlying websocket.
     *
     * This function waits for the other side to also close the Tcp connection
     * by responding with a FIN package. This might lead to a delay if the
     * connection was interrupted because e.g. the wirless adapter was switched
     * off.
     *
     * @param reason - Reason for timeout
     */
    public close(reason?: string) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: close(${reason})`);
        if (this.webSocket) {
            if (this.webSocket.readyState !== WebSocketWS.OPEN) {
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
     * @param reason - Reason for timeout
     */
    public terminate(reason?: string) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: terminate(${reason})`);
        if (this.webSocket) {
            if (this.webSocket.readyState !== WebSocketWS.OPEN) {
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
        this.stopPingPong();
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
            if (this.webSocket.readyState === WebSocketWS.OPEN) {
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
                    if (this.webSocket.readyState === WebSocketWS.OPEN) {
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
     * @param type    - The type field of the message should have this type.
     * @param typekey - The name of the member that holds the type that is checked for equality
     *                           with the type param.
     * @param timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return The promise will resolve when a value was received.
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
        if (!Object.prototype.hasOwnProperty.call(messageObj, typekey)) {
            throw new Error(`Received message without a "${typekey}" member.`);
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
     * @param timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return The promise will resolve when a value was received.
     *                      The value will be the JSON.parse'd object
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
     * @param timeout
     * @returns
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
     * @param timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return The promise will resolve when a value was received.
     *                                                 The promise will reject when
     *                                                 1) the timeout expired
     *                                                 2) the connection was closed
     */
    public async waitForMessage(timeout: number = -2): Promise<MessageEvent['data']> {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: waitForMessage(${timeout})`);
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
    private handleOpen(openEvent: Event) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleOpen()`);

        // Wakeup the reader in waitForOpen if somebody waits
        if (this.socketOpenFn) {
            this.socketOpenFn();
        }
        this.startPingPong(this.pingInterval, this.pongTimeout);
    }

    /**
     * This function handles the web sockets message event
     *
     * It enqueues the data and notifies any waiting reader.
     *
     * @param messageEvent
     */
    private handleMessage(messageEvent: MessageEvent) {
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleMessage(${messageEvent.data})`);
        if (WebSocketPromiseBased.isPing(messageEvent)) {
            this.sendPongMessage();
            return;
        }
        if (WebSocketPromiseBased.isPong(messageEvent)) {
            this.onPong.emit();
            return;
        }

        // Notify listeners for a new message
        this.emit('message', messageEvent);
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
     */
    private assertOpen(): void {
        if (!this.webSocket) {
            throw new Error('No websocket is bound to this instance.');
        }

        if (this.webSocket.readyState !== WebSocketWS.OPEN) {
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
        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleClose()`);
        this.closeReason = closeEvent.reason;
        if (this.dataAvailableFn) {
            this.dataAvailableFn(new Error('Connection was closed: ' + closeEvent.reason));
        }
        if (this.socketOpenFn) {
            this.socketOpenFn(new Error('Connection was closed: ' + closeEvent.reason));
        }
        this.stopPingPong();
    }

    /**
     * This function handles the websockets error event
     *
     * It notifies any waiting reader.
     *
     * @param errorEvent
     */
    private handleError(errorEvent: Event) {
        // The 'ws' package contains a .message member. we check for it even if the type itself
        // does not contain it.
        const message = (errorEvent as unknown as {message: string | undefined}) && '';

        MessageBus.send('debug', `${wslogId(this.webSocket)}: handleError()`);
        if (this.firstError === '') {
            this.firstError = message;
        } else {
            this.lastError = message;
        }
        if (this.dataAvailableFn) {
            this.dataAvailableFn(new Error(message));
        }
        if (this.socketOpenFn) {
            this.socketOpenFn(new Error(message));
        }
        this.stopPingPong();
    }

    // ######## Ping/Pong ########
    /**
     * Send Ping Message
     */
    private async sendPingMessage(): Promise<void> {
        await this.send(JSON.stringify({command: 'comm_ping'}));
    }
    /**
     * Send Pong Message
     */
    private async sendPongMessage(): Promise<void> {
        await this.send(JSON.stringify({command: 'comm_pong'}));
    }

    static isPing(message: MessageEvent): boolean {
        try {
            const messageObj = JSON.parse(message.data);
            return messageObj.command === 'comm_ping';
        } catch (e) {
            return false;
        }
    }

    static isPong(message: MessageEvent): boolean {
        try {
            const messageObj = JSON.parse(message.data);
            return messageObj.command === 'comm_pong';
        } catch (e) {
            return false;
        }
    }

    private async waitForPong(): Promise<void> {        
        return new Promise((resolve, reject) => {
            let disconnectPong: () => void;
            let disconnectStopPingPong: () => void;
            disconnectPong = this.onPong(() => {
                resolve();
                disconnectPong();
                disconnectStopPingPong();
            });
            disconnectStopPingPong = this.onStopPingPong(() => {
                reject(new Error('Ping pong stopped'));
                disconnectPong();
                disconnectStopPingPong();
            });
        });
    }
    /**
     * Starts pinging the client.
     *
     * @param pingInterval - Interval since last pong when to send another ping.
     * @param pongTimeout - Time to wait for the pong (after a ping) before severing the connection.
     */
    private startPingPong(pingInterval: number, pongTimeout: number): void {
        MessageBus.send(
            'debug',
            `${wslogId(this.webSocket)}: startPingPong(${pingInterval}, ${pongTimeout})`
        );

        if (this.isPinging) {
            throw new Error('Already ping / ponging');
        }
        this.isPinging = true;

        // Sends the ping. This is a wrapper for async
        const sendPing = async () => {
            try {
                // If not pinging anymore, because stopPingPing was called
                // Then resolve the waiter in stopPingPong and don't schedule another ping
                if (!this.isPinging) {
                    return;
                }

                // Send ping and wait for pong
                let pongTimeoutHandler: ReturnType<typeof setTimeout> | null = null;
                try {
                    // Send a ping
                    await this.sendPingMessage();

                    // Set a timeout for the pong
                    pongTimeoutHandler = setTimeout(() => {
                        this.terminate('Pong Timeout');
                    }, pongTimeout);

                    // Wait for the message
                    await this.waitForPong();

                    // Cancel timeout
                    clearTimeout(pongTimeoutHandler);
                } catch (e) {
                    // Cancel timeout
                    if (pongTimeoutHandler) {
                        clearTimeout(pongTimeoutHandler);
                    }

                    throw e;
                }

                // Reschedule another ping
                if (this.isPinging) {
                    this.pingTimeoutHandle = setTimeout(() => {
                        this.pingTimeoutHandle = null;
                        sendPing();
                    }, pingInterval);
                }
            } catch (e) {
                this.close();
            }
        };

        // Send the first ping
        sendPing();
    }

    /**
     * Stops the ping / pong process.
     */
    private stopPingPong(): void {
        MessageBus.send('log', `${wslogId(this.webSocket)}: stopPingPong()`);

        if (!this.isPinging) {
            return;
        }

        // Cancel the next ping if it is scheduled
        this.isPinging = false;

        if (this.pingTimeoutHandle) {
            clearTimeout(this.pingTimeoutHandle);
        }

        this.onStopPingPong.emit();
    }
}
