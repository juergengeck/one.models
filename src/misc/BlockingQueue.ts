/**
 * A queue implementation where the reader promises block until new data is available.
 */
export default class BlockingQueue<T> {
    private dataQueue: T[] = [];
    private dataListener: Array<(data: T | undefined, err?: Error) => void> = [];
    private readonly maxLength: number;

    constructor(maxLength: number = -1) {
        this.maxLength = maxLength;
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
        const listener = this.dataListener.shift();
        if (listener !== undefined) {
            listener(data);
            return;
        }

        // If no listener exists, then we enqueue the element unless the maximum size is already
        // reached.
        if (this.dataQueue.length === this.maxLength) {
            throw new Error(`Queue is full, it reached its maximum length of ${this.maxLength}`);
        }
        this.dataQueue.push(data);
    }

    /**
     * Get element from queue.
     *
     * If no element is in the queue, then the promise will not resolve, until there is.
     *
     * @param timeout
     */
    public async remove(timeout: number = -1): Promise<T> {
        const data = this.dataQueue.shift();
        if (data !== undefined) {
            return data;
        }

        return new Promise((resolve, reject) => {
            // Start the timeout for waiting on a new message
            const timeoutHandle =
                timeout > -1
                    ? setTimeout(() => {
                          this.removeDataListener(dataListener);
                          reject(new Error('Timeout expired'));
                      }, timeout)
                    : null;

            // Register the dataAvailable handler that is called when data is available
            const dataListener = (data: T | undefined, err: Error | undefined) => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                this.removeDataListener(dataListener);

                // Reject when cancelled
                if (err !== undefined) {
                    reject(err);
                    return;
                }

                // Check if data
                if (data === undefined) {
                    reject(
                        new Error('Internal error: Both data and error arguments are undefined.')
                    );
                    return;
                }

                resolve(data);
            };

            this.addDataListener(dataListener);
        });
    }

    /**
     * Cancels all pending remove promises.
     *
     * @param err
     */
    public cancelPendingPromises(err?: Error): void {
        for (const dataListener of this.dataListener) {
            dataListener(undefined, err || new Error('Cancelled by' + ' cancelPendingPromises'));
        }
    }

    /**
     * Remove the listener callbacks from dataListener.
     *
     * @param dataListener
     * @private
     */
    private removeDataListener(dataListener: (data: T | undefined, err?: Error) => void) {
        this.dataListener = this.dataListener.filter(listener => dataListener !== listener);
    }

    /**
     * Add the listener callback to dataListener.
     *
     * @param dataListener
     * @private
     */
    private addDataListener(dataListener: (data: T | undefined, err?: Error) => void) {
        this.dataListener.push(dataListener);
    }
}
