import type { ConnectionIncomingEvent, ConnectionOutgoingEvent, ConnectionPlugin } from '../types.js';

/**
 * Plugin that maintains connection health by sending periodic keep-alive messages.
 * Helps prevent connection timeouts and detects connection issues early.
 *
 * @implements {ConnectionPlugin}
 *
 * @example
 * ```typescript
 * const conn = new ExpoConnection('ws://example.com');
 * const keepAlive = new KeepAlivePlugin({ interval: 30000 }); // 30 seconds
 * conn.addPlugin(keepAlive);
 * ```
 */
export class KeepAlivePlugin implements ConnectionPlugin {
    /** Plugin name */
    public readonly name = 'keepAlive';

    private _interval: number;
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _lastMessageTime = 0;

    /**
     * Creates a new KeepAlivePlugin instance.
     *
     * @param options - Configuration options
     * @param options.interval - Interval in milliseconds between keep-alive messages
     */
    constructor(options: { interval: number }) {
        this._interval = options.interval;
    }

    /**
     * Starts the keep-alive timer when the connection opens.
     *
     * @param event - The connection event
     * @returns The unchanged event
     */
    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent {
        if (event.type === 'opened') {
            this._startTimer();
        } else if (event.type === 'closed') {
            this._stopTimer();
        } else if (event.type === 'message') {
            this._lastMessageTime = Date.now();
        }
        return event;
    }

    /**
     * Processes outgoing events and updates last message time.
     *
     * @param event - The event to transform
     * @returns The unchanged event
     */
    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent {
        if (event.type === 'message') {
            this._lastMessageTime = Date.now();
        }
        return event;
    }

    /**
     * Starts the keep-alive timer.
     * Sends a ping message if no messages have been sent/received within the interval.
     */
    private _startTimer(): void {
        this._lastMessageTime = Date.now();
        this._timer = setInterval(() => {
            const now = Date.now();
            if (now - this._lastMessageTime >= this._interval) {
                // Send keep-alive message
                this._lastMessageTime = now;
                return {
                    type: 'message',
                    data: 'ping'
                } as ConnectionOutgoingEvent;
            }
            return null;
        }, this._interval);
    }

    /**
     * Stops the keep-alive timer.
     */
    private _stopTimer(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * Gets the current keep-alive interval in milliseconds.
     */
    public get interval(): number {
        return this._interval;
    }

    /**
     * Sets a new keep-alive interval in milliseconds.
     * Restarts the timer with the new interval.
     */
    public set interval(value: number) {
        this._interval = value;
        if (this._timer) {
            this._stopTimer();
            this._startTimer();
        }
    }
} 