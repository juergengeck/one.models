/**
 * A class that manages multiple promises with a single resolve/reject interface.
 * Useful for handling multiple async operations that need to be resolved or rejected together.
 *
 * @template T The type of value that the promise resolves to
 *
 * @example
 * ```typescript
 * const multiPromise = new MultiPromise<string>();
 * 
 * // Get the promise to await on
 * const promise = multiPromise.promise;
 * 
 * // Resolve the promise
 * multiPromise.resolve('success');
 * 
 * // Or reject it
 * multiPromise.reject(new Error('failed'));
 * ```
 */
export class MultiPromise<T> {
    private _resolve!: (value: T | PromiseLike<T>) => void;
    private _reject!: (reason?: any) => void;
    private _promise: Promise<T>;

    /**
     * Creates a new MultiPromise instance.
     */
    constructor() {
        this._promise = new Promise<T>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    /**
     * Gets the underlying promise.
     */
    public get promise(): Promise<T> {
        return this._promise;
    }

    /**
     * Resolves the promise with the given value.
     *
     * @param value - The value to resolve with
     */
    public resolve(value: T): void {
        this._resolve(value);
    }

    /**
     * Rejects the promise with the given reason.
     *
     * @param reason - The reason for rejection
     */
    public reject(reason?: any): void {
        this._reject(reason);
    }
} 