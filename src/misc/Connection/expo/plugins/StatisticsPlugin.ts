import type { ConnectionIncomingEvent, ConnectionOutgoingEvent, ConnectionPlugin, ConnectionStatistics } from '../types.js';

/**
 * Plugin that tracks connection statistics such as bytes sent and received.
 * Provides a simple way to monitor data transfer volumes.
 *
 * @implements {ConnectionPlugin}
 *
 * @example
 * ```typescript
 * const conn = new ExpoConnection('ws://example.com');
 * const stats = conn.statistics;
 * console.log(`Received: ${stats.bytesReceived} bytes`);
 * console.log(`Sent: ${stats.bytesSent} bytes`);
 * ```
 */
export class StatisticsPlugin implements ConnectionPlugin {
    /** Plugin name */
    public readonly name = 'statistics';

    private _bytesReceived = 0;
    private _bytesSent = 0;

    /**
     * Gets the current connection statistics.
     *
     * @returns Object containing bytes sent and received
     */
    public get statistics(): ConnectionStatistics {
        return {
            bytesReceived: this._bytesReceived,
            bytesSent: this._bytesSent
        };
    }

    /**
     * Transforms and tracks incoming events.
     * Updates bytesReceived when message events are received.
     *
     * @param event - The event to transform
     * @returns The unchanged event
     */
    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent {
        if (event.type === 'message') {
            if (typeof event.data === 'string') {
                this._bytesReceived += new TextEncoder().encode(event.data).length;
            } else {
                this._bytesReceived += event.data.length;
            }
        }
        return event;
    }

    /**
     * Transforms and tracks outgoing events.
     * Updates bytesSent when message events are sent.
     *
     * @param event - The event to transform
     * @returns The unchanged event
     */
    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent {
        if (event.type === 'message') {
            if (typeof event.data === 'string') {
                this._bytesSent += new TextEncoder().encode(event.data).length;
            } else {
                this._bytesSent += event.data.length;
            }
        }
        return event;
    }

    /**
     * Resets all statistics to zero.
     */
    public reset(): void {
        this._bytesReceived = 0;
        this._bytesSent = 0;
    }

    /**
     * Gets the total number of bytes received.
     */
    public get bytesReceived(): number {
        return this._bytesReceived;
    }

    /**
     * Gets the total number of bytes sent.
     */
    public get bytesSent(): number {
        return this._bytesSent;
    }
} 