import type { ConnectionIncomingEvent, ConnectionOutgoingEvent, ConnectionPlugin } from '../types.js';

/**
 * Plugin that handles WebSocket operations in Expo environment.
 * Provides a simplified interface for WebSocket communication while maintaining
 * compatibility with the core Connection system.
 *
 * Features:
 * - Binary and text message support
 * - Connection lifecycle management
 * - Error handling
 * - Event transformation
 *
 * @implements {ConnectionPlugin}
 */
export class ExpoWebSocketPlugin implements ConnectionPlugin {
    /** Plugin name */
    public readonly name = 'websocket';

    /** The underlying WebSocket instance */
    private webSocket: WebSocket;

    /** Whether a close event has been sent */
    private closeEventSent = false;

    /** The reason for closing the connection */
    private closedReason: ConnectionIncomingEvent | null = null;

    /** Function to create incoming events */
    private createIncomingEvent: ((event: ConnectionIncomingEvent) => void) | null = null;

    /**
     * Creates a new ExpoWebSocketPlugin instance.
     *
     * @param webSocket - The WebSocket instance to wrap
     */
    constructor(webSocket: WebSocket) {
        this.webSocket = webSocket;
        this.setupWebSocket();
    }

    /**
     * Transforms incoming events.
     * This implementation passes through events unchanged as the actual
     * transformation happens in the event handlers.
     *
     * @param event - The event to transform
     * @returns The unchanged event
     */
    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent | null {
        return event;
    }

    /**
     * Transforms outgoing events into WebSocket operations.
     *
     * @param event - The event to transform
     * @returns null to indicate the event was handled
     */
    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent | null {
        if (event.type === 'close') {
            this.close(event.reason, event.terminate);
            return null;
        }

        if (event.type === 'message') {
            this.send(event.data);
            return null;
        }

        return null;
    }

    /**
     * Sets up the event creation function.
     *
     * @param createEvent - Function to create incoming events
     * @param id - Connection ID
     */
    public initialize(
        createEvent: (event: ConnectionIncomingEvent) => void,
        id: number
    ): void {
        this.createIncomingEvent = createEvent;

        // Check initial state
        if (this.webSocket.readyState === WebSocket.OPEN) {
            this.handleOpen();
        } else if (
            this.webSocket.readyState === WebSocket.CLOSING ||
            this.webSocket.readyState === WebSocket.CLOSED
        ) {
            this.setClosedReasonOnce('WebSocket was already closed', 'local');
            this.sendClosedEvent();
        }
    }

    /**
     * Releases the WebSocket instance.
     * After calling this, the plugin will no longer handle WebSocket events.
     */
    public release(): void {
        this.removeEventListeners();
        this.setClosedReasonOnce('WebSocket detached', 'local');
        this.sendClosedEvent();
    }

    // Private methods

    private setupWebSocket(): void {
        this.webSocket.binaryType = 'arraybuffer';
        this.addEventListeners();
    }

    private addEventListeners(): void {
        this.webSocket.addEventListener('open', this.handleOpen.bind(this));
        this.webSocket.addEventListener('message', this.handleMessage.bind(this));
        this.webSocket.addEventListener('close', this.handleClose.bind(this));
        this.webSocket.addEventListener('error', this.handleError.bind(this));
    }

    private removeEventListeners(): void {
        this.webSocket.removeEventListener('open', this.handleOpen.bind(this));
        this.webSocket.removeEventListener('message', this.handleMessage.bind(this));
        this.webSocket.removeEventListener('close', this.handleClose.bind(this));
        this.webSocket.removeEventListener('error', this.handleError.bind(this));
    }

    private handleOpen(): void {
        this.createIncomingEvent?.({
            type: 'opened'
        });
    }

    private handleMessage(event: MessageEvent): void {
        const data = typeof event.data === 'string'
            ? event.data
            : new Uint8Array(event.data as ArrayBuffer);

        this.createIncomingEvent?.({
            type: 'message',
            data
        });
    }

    private handleClose(event: CloseEvent): void {
        this.setClosedReasonOnce(event.reason || 'Connection closed', 'remote');
        this.sendClosedEvent();
    }

    private handleError(event: Event): void {
        const message = (event as any).message || 'Unknown error';
        this.setClosedReasonOnce(`Error: ${message}`, 'local');
        this.sendClosedEvent();
    }

    private send(data: Uint8Array | string): void {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        if (data instanceof Uint8Array) {
            this.webSocket.send(data.buffer);
        } else {
            this.webSocket.send(data);
        }
    }

    private close(reason?: string, terminate: boolean = false): void {
        if (this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const closeReason = reason ? `: ${reason}` : '';
        const message = terminate ? `Terminated${closeReason}` : `Closed${closeReason}`;

        // WebSocket spec limits close reason to 123 bytes
        const truncatedMessage = message.length > 123 ? message.slice(0, 120) + '...' : message;

        this.webSocket.close(1000, truncatedMessage);
        this.setClosedReasonOnce(message, 'local');

        if (terminate) {
            this.sendClosedEvent();
        }
    }

    private setClosedReasonOnce(reason: string, origin: 'local' | 'remote'): void {
        if (this.closedReason === null) {
            this.closedReason = {
                type: 'closed',
                reason,
                origin
            };
        }
    }

    private sendClosedEvent(): void {
        if (this.closeEventSent || !this.createIncomingEvent) {
            return;
        }

        this.createIncomingEvent(
            this.closedReason || {
                type: 'closed',
                reason: 'Connection closed without reason',
                origin: 'local'
            }
        );
        this.closeEventSent = true;
    }
} 