/**
 * A type-safe event emitter class that supports adding and removing listeners.
 * This is a simplified version optimized for mobile use.
 *
 * @typeParam T - The type of the event handler function
 *
 * @example
 * ```typescript
 * const event = new OEvent<(data: string) => void>();
 * event.addListener(data => console.log(data));
 * event.emit('Hello World');
 * ```
 */
export class OEvent<T extends Function> {
    private listeners: Set<T> = new Set();

    /**
     * Adds a listener function to the event.
     *
     * @param listener - The function to call when the event is emitted
     * @returns A function that removes the listener when called
     *
     * @example
     * ```typescript
     * const removeListener = event.addListener(data => {
     *   console.log(data);
     * });
     *
     * // Later, to remove the listener:
     * removeListener();
     * ```
     */
    public addListener(listener: T): () => void {
        this.listeners.add(listener);
        return () => this.removeListener(listener);
    }

    /**
     * Removes a previously added listener function.
     *
     * @param listener - The function to remove
     * @returns true if the listener was found and removed, false otherwise
     */
    public removeListener(listener: T): boolean {
        return this.listeners.delete(listener);
    }

    /**
     * Removes all listeners from this event.
     */
    public removeAllListeners(): void {
        this.listeners.clear();
    }

    /**
     * Gets the current number of listeners.
     *
     * @returns The number of registered listeners
     */
    public listenerCount(): number {
        return this.listeners.size;
    }

    /**
     * Calls all registered listener functions with the provided arguments.
     *
     * @param args - Arguments to pass to each listener
     *
     * @example
     * ```typescript
     * const event = new OEvent<(x: number, y: number) => void>();
     * event.addListener((x, y) => console.log(x + y));
     * event.emit(2, 3); // Logs: 5
     * ```
     */
    public emit(...args: any[]): void {
        for (const listener of this.listeners) {
            try {
                listener(...args);
            } catch (e) {
                console.error('Error in event listener:', e);
            }
        }
    }
} 