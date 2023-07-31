import MultiPromise from './MultiPromise.js';

/**
 * A queue implementation where the reader promises block until new data is available.
 */
export default class BlockingQueue<T> {
    private dataQueue: T[] = [];
    private dataListeners: MultiPromise<T>;
    private readonly maxDataQueueLength: number;

    /**
     * Constructs a new blokcing queue.
     *
     * @param maxDataQueueLength
     * @param maxPendingPromiseCount
     * @param defaultTimeout - Default timeout used for remove() call when no timeout was specified.
     *                         Defaults to Number.POSITIVE_INFINITY.
     */
    constructor(
        maxDataQueueLength = Number.POSITIVE_INFINITY,
        maxPendingPromiseCount = Number.POSITIVE_INFINITY,
        defaultTimeout = Number.POSITIVE_INFINITY
    ) {
        this.maxDataQueueLength = maxDataQueueLength;
        this.dataListeners = new MultiPromise<T>(maxPendingPromiseCount, defaultTimeout);
    }

    /**
     * Add data to the queue.
     *
     * This will throw if the queue is full.
     *
     * @param data
     */
    public add(data: T): void {
        // If a listener exists then the queue is empty and somebody is waiting for new data.
        if (this.dataListeners.resolveFirst(data)) {
            return;
        }

        // If no listener exists, then we enqueue the element unless the maximum size is already
        // reached.
        if (this.dataQueue.length === this.maxDataQueueLength) {
            throw new Error(
                `Queue is full, it reached its maximum length of ${this.maxDataQueueLength}`
            );
        }
        this.dataQueue.push(data);
    }

    /**
     * Get element from queue.
     *
     * If no element is in the queue, then the promise will not resolve, until there is.
     *
     * @param timeout - Timeout as unsigned 32-bit integer or Number.POSITIVE_INFINITY. If
     *                  undefined use the default value passed to the constructor.
     */
    public async remove(timeout?: number): Promise<T> {
        const data = this.dataQueue.shift();
        if (data !== undefined) {
            return data;
        }

        return this.dataListeners.addNewPromise(timeout);
    }

    /**
     * Cancels all pending remove promises.
     *
     * @param err
     */
    public cancelPendingPromises(err?: Error): void {
        this.dataListeners.rejectAll(err || new Error('Cancelled by cancelPendingPromises'));
    }

    /**
     * Clears the queue and returns the internal array.
     */
    public clear(): T[] {
        const dataQueue = this.dataQueue;
        this.dataQueue = [];
        return dataQueue;
    }

    /**
     * Get the number of elements in the queue.
     */
    get length(): number {
        return this.dataQueue.length;
    }

    /**
     * Get the number of pending promises if no elements are in the queue.
     */
    get pendingPromiseCount(): number {
        return this.dataListeners.pendingPromiseCount;
    }

    /**
     * Get a copy of the internal data buffer.
     *
     * Note that the elements themselves are not copied, so if the contents are not native types,
     * do not modify them.
     */
    get data(): T[] {
        return [...this.dataQueue];
    }
}
