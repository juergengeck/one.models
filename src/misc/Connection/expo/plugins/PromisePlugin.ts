import type { ConnectionIncomingEvent, ConnectionOutgoingEvent, ConnectionPlugin } from '../types.js';
import { MultiPromise } from '../support/MultiPromise.js';

/**
 * Plugin that adds promise-based message handling to the connection.
 * Allows for sending messages and waiting for responses using promises.
 *
 * @implements {ConnectionPlugin}
 *
 * @example
 * ```typescript
 * const conn = new ExpoConnection('ws://example.com');
 * const promisePlugin = new PromisePlugin();
 * conn.addPlugin(promisePlugin);
 *
 * // Send a message and wait for response
 * const response = await promisePlugin.sendAndWait('hello');
 * console.log('Response:', response);
 * ```
 */
export class PromisePlugin implements ConnectionPlugin {
    /** Plugin name */
    public readonly name = 'promise';

    private _promises = new Map<string, MultiPromise<ConnectionIncomingEvent>>();
    private _messageCounter = 0;

    /**
     * Processes incoming events and resolves corresponding promises.
     *
     * @param event - The event to transform
     * @returns The unchanged event
     */
    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent {
        if (event.type === 'message' && typeof event.data === 'string') {
            try {
                const message = JSON.parse(event.data);
                if (message && typeof message === 'object' && 'id' in message) {
                    const promise = this._promises.get(message.id);
                    if (promise) {
                        promise.resolveAll(event);
                        this._promises.delete(message.id);
                    }
                }
            } catch (error) {
                // Not a JSON message or doesn't have an ID, ignore
            }
        }
        return event;
    }

    /**
     * Processes outgoing events and adds message IDs for tracking.
     *
     * @param event - The event to transform
     * @returns The modified event with message ID
     */
    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent {
        if (event.type === 'message' && typeof event.data === 'string') {
            try {
                const message = JSON.parse(event.data);
                if (message && typeof message === 'object') {
                    const id = this._generateMessageId();
                    message.id = id;
                    return {
                        ...event,
                        data: JSON.stringify(message)
                    };
                }
            } catch (error) {
                // Not a JSON message, return as is
            }
        }
        return event;
    }

    /**
     * Sends a message and returns a promise that resolves when a response is received.
     *
     * @param data - The message data to send
     * @param timeout - Optional timeout in milliseconds
     * @returns Promise that resolves with the response event
     */
    public sendAndWait(data: unknown, timeout?: number): Promise<ConnectionIncomingEvent> {
        const id = this._generateMessageId();
        const promise = new MultiPromise<ConnectionIncomingEvent>(1, timeout ?? Number.POSITIVE_INFINITY);
        this._promises.set(id, promise);

        const message = {
            id,
            data
        };

        const event: ConnectionOutgoingEvent = {
            type: 'message',
            data: JSON.stringify(message)
        };

        return promise.addNewPromise();
    }

    /**
     * Generates a unique message ID.
     *
     * @returns A unique message ID string
     */
    private _generateMessageId(): string {
        return `msg_${++this._messageCounter}`;
    }

    /**
     * Cleans up any pending promises.
     * Called when the connection is closed.
     */
    public cleanup(): void {
        for (const [id, promise] of this._promises) {
            promise.rejectAll(new Error('Connection closed'));
            this._promises.delete(id);
        }
    }
} 