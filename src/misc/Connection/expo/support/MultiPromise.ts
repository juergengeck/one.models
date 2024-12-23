/**
 * Manages multiple promises with timeout support.
 * Useful for handling async operations that may need to be resolved or rejected as a group.
 *
 * @typeParam T - The type of value the promises resolve to
 *
 * @example
 * ```typescript
 * const promises = new MultiPromise<string>(3, 5000); // max 3 promises, 5s timeout
 * promises.addNewPromise().then(value => console.log('Got value:', value));
 * promises.resolveAll('success'); // resolves all pending promises
 * ```
 */
export class MultiPromise<T> {
    private promises: Array<{
        resolve: (value: T | PromiseLike<T>) => void;
        reject: (reason?: any) => void;
        timeout: NodeJS.Timeout | null;
    }> = [];

    /**
     * Creates a new MultiPromise instance.
     *
     * @param maxPromises - Maximum number of concurrent promises allowed
     * @param defaultTimeout - Default timeout in milliseconds for new promises
     */
    constructor(
        private readonly maxPromises: number,
        private readonly defaultTimeout: number
    ) {}

    /**
     * Adds a new promise to the group.
     *
     * @param timeout - Optional custom timeout for this promise
     * @returns A promise that resolves/rejects based on group operations
     * @throws {Error} If maximum number of promises is exceeded
     *
     * @example
     * ```typescript
     * const promise = multiPromise.addNewPromise(1000); // 1s timeout
     * promise.then(
     *   value => console.log('Success:', value),
     *   error => console.error('Failed:', error)
     * );
     * ```
     */
    public addNewPromise(timeout?: number): Promise<T> {
        if (this.promises.length >= this.maxPromises) {
            throw new Error(
                `Cannot add more than ${this.maxPromises} promises`
            );
        }

        return new Promise<T>((resolve, reject) => {
            const timeoutMs = timeout ?? this.defaultTimeout;
            let timeoutHandle: NodeJS.Timeout | null = null;

            if (timeoutMs !== Number.POSITIVE_INFINITY) {
                timeoutHandle = setTimeout(() => {
                    this.removePromise(resolve);
                    reject(new Error('Promise timed out'));
                }, timeoutMs);
            }

            this.promises.push({
                resolve,
                reject,
                timeout: timeoutHandle
            });
        });
    }

    /**
     * Resolves all pending promises with the given value.
     *
     * @param value - The value to resolve the promises with
     */
    public resolveAll(value: T): void {
        while (this.promises.length > 0) {
            const promise = this.promises.pop();
            if (promise) {
                if (promise.timeout) {
                    clearTimeout(promise.timeout);
                }
                promise.resolve(value);
            }
        }
    }

    /**
     * Rejects all pending promises with the given reason.
     *
     * @param reason - The reason for rejection
     */
    public rejectAll(reason?: any): void {
        while (this.promises.length > 0) {
            const promise = this.promises.pop();
            if (promise) {
                if (promise.timeout) {
                    clearTimeout(promise.timeout);
                }
                promise.reject(reason);
            }
        }
    }

    /**
     * Gets the number of currently pending promises.
     *
     * @returns The number of pending promises
     */
    public getPendingCount(): number {
        return this.promises.length;
    }

    /**
     * Checks if there are any pending promises.
     *
     * @returns true if there are pending promises, false otherwise
     */
    public hasPendingPromises(): boolean {
        return this.promises.length > 0;
    }

    private removePromise(resolve: (value: T | PromiseLike<T>) => void): void {
        const index = this.promises.findIndex(p => p.resolve === resolve);
        if (index !== -1) {
            const [promise] = this.promises.splice(index, 1);
            if (promise.timeout) {
                clearTimeout(promise.timeout);
            }
        }
    }
} 