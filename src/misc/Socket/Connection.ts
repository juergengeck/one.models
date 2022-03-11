import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {EventEmitter} from 'events';
import type {WebSocketPromiseBasedInterface} from '@refinio/one.core/lib/websocket-promisifier';
import {OEvent} from '../OEvent';
import BlockingQueue from '../BlockingQueue';
import MultiPromise from '../MultiPromise';
import Watchdog from '../Watchdog';
import type {IConnection} from './IConnection';
const MessageBus = createMessageBus('WebSocketPromiseBased');

/**
 * Returns the byte count of the passed string in UTF-8 notation.
 *
 * @param input
 */
function utf8ByteCount(input: string): number {
    return new TextEncoder().encode(input).length;
}

/**
 * Shortens the input string to be lesser or equal than maxByteLength in UTF-8 representation.
 *
 * It is not the most efficient solution, but the efficient solution would be much more complex like
 * estimating the number of bytes that have to be removed by something like ceil(length -
 * mayByteLength / 4)
 *
 * @param input - Input string that is possibly longer than maxByteLength
 * @param maxByteLength - Maximum length.
 */
function shortenStringUTF8(input: string, maxByteLength: number): string {
    let inputShort = input;
    while (utf8ByteCount(inputShort) > maxByteLength) {
        inputShort = inputShort.slice(0, -1);
    }
    return inputShort;
}

/**
 * This class is a wrapper for web sockets, that allows to receive messages with async / await
 * instead of using callbacks (onmessage onopen ...)
 *
 * It also has a on('message') event, because sometimes you just need it. When you solely use the
 * event based interface, and don't use the waitForMessage functions, then you need to set
 * disableWaitForMessage to true, because otherwise you will get an error that you didn't collect
 * incoming messages with waitFor... functions.
 */
export default class Connection implements IConnection {
    /**
     * Event is emitted when a new message is received.
     */
    public onMessage = new OEvent<(message: Uint8Array | string) => void>();

    // Members
    public webSocket: WebSocket | null;
    private readonly deregisterHandlers: () => void;

    // Members for unique id management for logging
    private static idCounter: number = 0;
    public readonly id: number = ++Connection.idCounter;

    // Members for promise based handling of data
    private dataQueue: BlockingQueue<ArrayBuffer | string>;
    private openPromises: MultiPromise<void>;

    private disableWaitForMessageInt: boolean = false;
    private closeReason: string = '';

    /**
     * Construct a new connection - at the moment based on WebSockets
     */
    constructor(
        webSocket: WebSocket,
        maxDataQueueSize = 10,
        defaultReadTimeout = Number.POSITIVE_INFINITY,
        defaultOpenTimeout = Number.POSITIVE_INFINITY
    ) {
        super();
        MessageBus.send('debug', `${this.id}: constructor()`);

        // Setup members
        this.webSocket = webSocket;
        this.openPromises = new MultiPromise<void>(1, defaultOpenTimeout);

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
    }

    // ######## Socket Management & Settings ########
    /**
     * Disables the waitForMessage functions.
     *
     * This is required, if you only want to use the event based interface for retrieving
     * messages, otherwise the dataQueue would overflow.
     * Calling this function will flush the remaining elements in the data queue by calling the
     * onMessage event for each remaining element.
     *
     * @param value
     */
    public set disableWaitForMessage(value: boolean) {
        this.disableWaitForMessageInt = value;

        if (value) {
            const messageEvents = this.dataQueue.clear();

            for (const messageEvent of messageEvents) {
                this.emit('message', messageEvent);
                this.onMessage.emit(messageEvent);
            }

            this.dataQueue.cancelPendingPromises(
                new Error('Waiting for incoming messages has been disabled.')
            );
        }
    }

    /**
     * Get the waitForMessage state
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
        this.stopPingPong();
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
     * @param reason - Reason for timeout
     * @param omitReason - If true, don't append the reason to the close reason.
     */
    public close(reason?: string, omitReason: boolean = false): void {
        MessageBus.send('debug', `${this.id}: close(${reason})`);

        const webSocket = this.assertNotDetached();
        if (webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.appendCloseReason(`close called: ${reason}`);

        // Shorten the reason string to maximum 123 bytes, because the standard mandates it:
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close
        webSocket.close(1000, shortenStringUTF8(this.closeReason, 123));
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
    public terminate(reason?: string): void {
        MessageBus.send('debug', `${this.id}: terminate(${reason})`);

        this.appendCloseReason(`terminate called: ${reason}`);

        const webSocket = this.assertNotDetached();
        if (webSocket.readyState === WebSocket.OPEN) {
            this.close(this.closeReason, true);
        }

        this.cleanupAfterClose();
    }

    /**
     * Wait for the socket to be open.
     *
     * @param timeout
     */
    public async waitForOpen(timeout?: number): Promise<void> {
        MessageBus.send('debug', `${this.id}: waitForOpen()`);
        return this.openPromises.addNewPromise(timeout);
    }

    // ######## Sending messages ########

    /**
     * Send data to the websocket.
     * @param data
     */
    public send(data: Uint8Array | string): void {
        MessageBus.send('debug', `${this.id}: send(${JSON.stringify(data)})`);
        const websocket = this.assertOpen();
        websocket.send(data);
    }

    // ######## Private API ########

    private cleanupAfterClose(): void {
        this.dataQueue.cancelPendingPromises(new Error(this.closeReason));
        this.openPromises.rejectAll(new Error(this.closeReason));
    }

    /**
     * Assert that the websocket is not detached.
     */
    private assertNotDetached(): WebSocket {
        if (!this.webSocket) {
            throw new Error('No websocket is bound to this instance.');
        }

        return this.webSocket;
    }

    /**
     * Function asserts that the connection is open.
     *
     * If it is closed it will reject the promise with a message having the close reason.
     */
    private assertOpen(): WebSocket {
        const webSocket = this.assertNotDetached();

        if (webSocket.readyState !== WebSocket.OPEN) {
            throw new Error(`The websocket is closed. ${this.closeReason}`);
        }

        return webSocket;
    }

    /**
     * This function handles the web sockets open event
     *
     * It notifies any waiting reader.
     *
     * @param openEvent
     */
    private handleOpen(openEvent: unknown) {
        MessageBus.send('debug', `${this.id}: handleOpen()`);
        this.openPromises.resolveAll();
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
        this.onMessage.emit(messageEvent.data);
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
        this.appendCloseReason(`close event called: ${closeEvent.reason}`);
        this.cleanupAfterClose();
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
        this.appendCloseReason(`error event called: ${(errorEvent as any).message}`);
        this.cleanupAfterClose();
    }

    /**
     * Append a close reason to the closeReason member.
     *
     * We have several sources of error messages (local & remote, close / terminate ...).
     * Sometimes more than one source might deliver a close reason (e.g. each side of the
     * bidirectional pipe might give us a reason) That's why we append them.
     *
     * @param reason - The close reason to append.
     */
    private appendCloseReason(reason: string): void {
        if (this.closeReason === '') {
            this.closeReason = 'Closed due to:\n';
        }
        this.closeReason += ` - ${reason}`;
    }
}
