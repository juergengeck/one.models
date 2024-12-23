import { OEvent } from './support/OEvent.js';
import { StateMachine } from './support/StateMachine.js';
import { MultiPromise } from './support/MultiPromise.js';
import { ExpoWebSocketPlugin } from './plugins/ExpoWebSocketPlugin.js';
import { StatisticsPlugin } from './plugins/StatisticsPlugin.js';
import type { ConnectionIncomingEvent, ConnectionOutgoingEvent } from './types.js';

/**
 * ExpoConnection provides a WebSocket-based communication layer optimized for Expo/React Native.
 * It implements a simplified version of the Connection system, focusing on mobile-specific requirements
 * while maintaining compatibility with the core Connection API.
 *
 * Features:
 * - State management (connecting, open, closed)
 * - Event-based message handling
 * - Binary and text message support
 * - Promise-based async operations
 * - Basic plugin system
 * - Connection statistics
 *
 * @example
 * ```typescript
 * const conn = new ExpoConnection('ws://example.com');
 * await conn.waitForOpen();
 * conn.send('Hello Server!');
 * conn.onMessage(msg => console.log('Received:', msg));
 * ```
 */
export class ExpoConnection {
    /** Current connection state */
    public state: StateMachine<'connecting' | 'open' | 'closed', 'open' | 'close'> = new StateMachine();

    /** Event emitted when a new message is received */
    public onMessage = new OEvent<(message: Uint8Array | string) => void>();

    /** The underlying WebSocket instance */
    private webSocket!: WebSocket;

    /** Plugins registered with this connection */
    private plugins: Map<string, any> = new Map();

    /** Promise management for async operations */
    private openPromises: MultiPromise<void>;

    /** Unique identifier for this connection */
    private static idCounter: number = 0;
    public readonly id: number = ++ExpoConnection.idCounter;

    /**
     * Creates a new ExpoConnection instance.
     *
     * @param url - The WebSocket URL to connect to
     * @param defaultOpenTimeout - Maximum time to wait for connection to open (in milliseconds)
     * @throws {Error} If the URL is invalid or WebSocket creation fails
     *
     * @example
     * ```typescript
     * const conn = new ExpoConnection('ws://example.com');
     * ```
     */
    constructor(url: string, defaultOpenTimeout = Number.POSITIVE_INFINITY) {
        this.state = new StateMachine();
        this.state.addState('connecting');
        this.state.addState('open');
        this.state.addState('closed');
        this.state.setInitialState('connecting');
        this.state.addEvent('open');
        this.state.addEvent('close');
        this.state.addTransition('open', 'connecting', 'open');
        this.state.addTransition('close', 'connecting', 'closed');
        this.state.addTransition('close', 'open', 'closed');

        this.openPromises = new MultiPromise<void>(1, defaultOpenTimeout);
        this.setupWebSocket(url);
        this.addPlugin(new ExpoWebSocketPlugin(this.webSocket));
        this.addPlugin(new StatisticsPlugin());
    }

    /**
     * Waits for the connection to be established.
     *
     * @param timeout - Optional timeout in milliseconds
     * @returns Promise that resolves when connection is open
     * @throws {Error} If connection fails or times out
     *
     * @example
     * ```typescript
     * try {
     *   await conn.waitForOpen(5000); // Wait up to 5 seconds
     *   console.log('Connected!');
     * } catch (e) {
     *   console.error('Connection failed:', e);
     * }
     * ```
     */
    public async waitForOpen(timeout?: number): Promise<void> {
        if (this.state.currentState === 'open') {
            return;
        }

        if (this.state.currentState === 'closed') {
            throw new Error('This connection is closed. It will never be opened again.');
        }

        await this.openPromises.addNewPromise(timeout);
    }

    /**
     * Sends data through the WebSocket connection.
     *
     * @param message - The message to send (string or binary data)
     * @throws {Error} If connection is not open or send fails
     *
     * @example
     * ```typescript
     * // Send text
     * conn.send('Hello Server!');
     *
     * // Send binary
     * const data = new Uint8Array([1, 2, 3]);
     * conn.send(data);
     * ```
     */
    public send(message: Uint8Array | string): void {
        this.createOutgoingEvent({ type: 'message', data: message });
    }

    /**
     * Closes the connection gracefully.
     *
     * @param reason - Optional reason for closing
     *
     * @example
     * ```typescript
     * conn.close('User logged out');
     * ```
     */
    public close(reason?: string): void {
        this.createOutgoingEvent({ type: 'close', reason, terminate: false });
    }

    /**
     * Terminates the connection immediately.
     * Use this for immediate shutdown without waiting for acknowledgment.
     *
     * @param reason - Optional reason for termination
     */
    public terminate(reason?: string): void {
        this.createOutgoingEvent({ type: 'close', reason, terminate: true });
    }

    /**
     * Adds a plugin to the connection.
     *
     * @param plugin - The plugin instance to add
     * @throws {Error} If plugin with same name already exists
     */
    public addPlugin(plugin: any): void {
        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin '${plugin.name}' already exists`);
        }
        this.plugins.set(plugin.name, plugin);
    }

    /**
     * Gets connection statistics if StatisticsPlugin is enabled.
     *
     * @returns Current connection statistics
     */
    public get statistics() {
        const stats = this.plugins.get('statistics');
        if (!stats) {
            return { bytesReceived: 0, bytesSent: 0 };
        }
        return stats.statistics;
    }

    // Private methods

    /**
     * Sets up the WebSocket instance and its event handlers.
     * @private
     */
    private setupWebSocket(url: string): void {
        this.webSocket = new WebSocket(url);
        this.webSocket.binaryType = 'arraybuffer';
    }

    /**
     * Creates and processes an outgoing event through the plugin chain.
     * @private
     */
    private createOutgoingEvent(event: ConnectionOutgoingEvent): void {
        for (const plugin of this.plugins.values()) {
            if (plugin.transformOutgoingEvent) {
                const transformed = plugin.transformOutgoingEvent(event);
                if (transformed === null) return;
                event = transformed;
            }
        }
    }

    /**
     * Creates and processes an incoming event through the plugin chain.
     * @private
     */
    private createIncomingEvent(event: ConnectionIncomingEvent): void {
        for (const plugin of this.plugins.values()) {
            if (plugin.transformIncomingEvent) {
                const transformed = plugin.transformIncomingEvent(event);
                if (transformed === null) return;
                event = transformed;
            }
        }

        if (event.type === 'message') {
            this.onMessage.emit(event.data);
        } else if (event.type === 'opened') {
            this.state.triggerEvent('open');
            this.openPromises.resolveAll();
        } else if (event.type === 'closed') {
            this.state.triggerEvent('close');
            this.openPromises.rejectAll(new Error(`Connection closed: ${event.reason}`));
        }
    }
} 