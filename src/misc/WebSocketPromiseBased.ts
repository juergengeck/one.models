import WebSocketWS from 'isomorphic-ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import {EventEmitter} from 'events';
import type {WebSocketPromiseBasedInterface} from 'one.core/lib/websocket-promisifier';
import {OEvent} from './OEvent';
const MessageBus = createMessageBus('WebSocketPromiseBased');

type PingPongMessage = {type: 'pingPong'; requestNr?: number; responseNr?: number};

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

    /**
     * Construct a new connection - at the moment based on WebSockets
     */
    constructor(webSocket: WebSocket, maxDataQueueSize = 10) {
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

        // Configure for binary messages
        this.webSocket.binaryType = 'arraybuffer';

        // configure websocket callbacks
        const boundOpenHandler = this.handleOpen.bind(this);
        const boundMessageHandler = this.handleMessage.bind(this);
        const boundPingPongFilter = this.filterPingPongFromMessage.bind(this);
        const boundCloseHandler = this.handleClose.bind(this);
        const boundErrorHandler = this.handleError.bind(this);
        this.webSocket.addEventListener('open', boundOpenHandler);
        this.webSocket.addEventListener('message', boundMessageHandler);
        this.webSocket.addEventListener('message', boundPingPongFilter);
        this.webSocket.addEventListener('close', boundCloseHandler);
        this.webSocket.addEventListener('error', boundErrorHandler);
        this.deregisterHandlers = () => {
            if (this.webSocket) {
                this.webSocket.removeEventListener('open', boundOpenHandler);
                this.webSocket.removeEventListener('message', boundMessageHandler);
                this.webSocket.removeEventListener('message', boundPingPongFilter);
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
            // // Release the websocket, so that nobody can accidentally use it while it waits for the FIN
            // this.releaseWebSocket();
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

    private setTimeoutId: number;
    private wsTimeout = 30000;

    private filterPingPongFromMessage(messageEvent: MessageEvent) {
        /*
        Introduce a Ping/Pong-Protocol for all websocket connections.
        Filter ping pong from the normal message flow to not interrupt it.
        Points to consider:
        1. The connection is established with the commserver and then handed over to the peer.
           The client would then get multiple pongs, from the commserver and the peer.
           The Ping/Pong protocol needs a flag, which can stop sending pongs from one side.
           We have to wait till after the commserver has handed over the connection and stopped
           listening. This happens after the sendCommunicationRequestMessage is called, (shortly
           after the ConnectionHandoverMessage has been received). Sending pongs else they could
           keep-alive a potential broken peer connection.
        2. To prevent 1. we could only start the Ping/Pong after the
           sendCommunicationRequestMessage/ConnectionHandoverMessage
           has been received.
           But this leaves potential orphans with the commserver ... or not because the
           commserver does his own ping pong as well.
           To prevent having to edit the CommunicationServer.ts we actually have to start after
           the commserver stopped listening to the connection else it will throw
           'Received unexpected or malformed message from client.'

         Resolution:
         1. When to start pinging: In this.handleMessage filter for
            "communication_request" this will indicate that the handover took place and the
            commserver stopped listening.
            * This is general WebSocketPromiseBased code which is only allowed to be called
              after an external message has been received else it could disrupt other
              communications. It probably should be implemented independent.
            * When a Ping/Pong is received this.handleMessage needs to return and don't emit to
              prevent confusing other protocols.
            * We should probably wait 500ms after receiving "communication_request" to make it
              highly likely the other side answered and the handover took place.
              * If we wanted to be sure the commserver stopped the commserver would have to notify
                the clients that he stopped now. But again if it would be independent that wouldn't
                be needed.
              * In the time we wait the connection could already have been closed. This
                shouldn't present an issue the timout will occur and it will be terminated again
                which ignores it if it has already been terminated afterwards the interval will
                be removed like usual.
         2. Start ping ponging once. Rremember that it was started with a class state.
            * private isPinging = false
         3. When to send pong:
            * In this.handleMessage add a filter for ping and sent a pong when a ping is received
         4. PingPong could use the same PingMessage PongMessage as defined in
            CommunicationServerProtocol.ts
         5. Where to set the pingInterval and pongTimeout?
            * Introduce new class and constructor arguments with default values
            * clientPingInterval = 30000
            * clientPongTimeout = 3000
         6. The naming should make clear that it is a client-client Ping/Pong
         7. When the pongTimeout is reached the websocket will be terminated
         */
    }

    // requestNr will be uneven
    public async sentPing(requestNr: number) {
        return new Promise((resolve, reject) => {
            this.setTimeoutId = setTimeout(() => {
                this.terminate('No response for ping, reached timeout');
            }, this.wsTimeout);
        });
    }
    // responseNr will be uneven
    public async sentPong(responseNr: number) {}

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
    }
}
