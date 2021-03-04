/**
 * Represents the behaviour when there are no listeners.
 * <br>
 *      -> Default - does nothing if no listener is registered.<br>
 *      -> Error - throws if no one is listening.<br>
 */
export enum EventTypes {
    Default,
    Error
}

/**
 * !OEvent is chosen as class name over Event, because the second option is reserved. <br>
 * Events handling class. Interface provides possibility to register handlers for an event and to emit it. There are 3
 * possible emit options:
 *
 * emitAndForget - Use when the emitter doesn't care about the result of the execution of the listeners handlers.<br>
 * emitAll - Use when the emitter is interested in the results of the listeners handlers execution.<br>
 * emitRace - Use when the emitter is interested only in the first settled promise from the listeners handlers.
 * NOTE: emitAndForget & emitAll offer the possibility to execute the listeners handlers in parallel or sequentially.
 * This is configurable through the 'executeAsynchronously' optional parameter in the constructor. 'executeAsynchronously'
 * defaults to true.
 *
 * <p><p>
 * ### Usage:
 *
 * ####Emitter class:
 * ```
 * // create an event, which emits a string value
 * const event = new OEvent<(arg:string) => void>(EventTypes.Default, true);
 *
 * // emit the event
 * event.emitAll('emitted string value');
 *
 *```
 *
 * ####Listener class:
 * ```
 * // register handler for the event; the return value of the connect function is the unregister handler
 * const disconnect = event.connect( emittedValue => {
 *     return new Promise<void>(resolve => {
 *       setTimeout(() => {
 *          resolve();
 *      }, 1 * 100);
 *  });
 * }
 *
 * //unregister
 * disconnect()
 * ```
 *
 */
export class OEvent<T extends (...arg: any) => void> {
    public onError: ((err: any) => void) | null = null;

    private handlers = new Set<(arg1: Parameters<T>) => Promise<ReturnType<T>> | ReturnType<T>>();
    private readonly type: EventTypes;
    private readonly executeAsynchronously: boolean;

    /**
     * Create a OEvent object.
     * @param type - defines if the emit functions will throw if no one is listening.
     * @param executeAsynchronously
     */
    constructor(type: EventTypes = EventTypes.Default, executeAsynchronously = true) {
        this.type = type;
        this.executeAsynchronously = executeAsynchronously;
    }

    /**
     * Registers a callback to be executed when the event is emitted. Returns the handler for unregistration.
     * @param callback - The callback to be executed when the event is emitted.
     */
    public connect(
        callback: (arg1: Parameters<T>) => Promise<ReturnType<T>> | ReturnType<T>
    ): () => void {
        if (this.handlers.has(callback)) {
            console.error('callback already registered');
        }
        this.handlers.add(callback);
        return () => {
            const found = this.handlers.delete(callback);
            if (!found) {
                console.error('callback was not registered');
            }
        };
    }

    /**
     * Returns the first settled promise from listeners handlers.
     *
     * NOTE: It behaves like Promise.race().
     *
     * @param emittedValue
     */
    emitRace(...emittedValue: Parameters<T>): Promise<ReturnType<T>> {
        const handlersPromises = this.getHandlersPromises(emittedValue);

        return Promise.race(this.buildPromise(handlersPromises));
    }

    /**
     * Returns a promise that resolves to array of results of listeners handlers. The handlers will be executed in
     * parallel or sequentially based on the executeAsynchronously flag set in the constructor.
     *
     * @param emittedValue
     */
    async emitAll(...emittedValue: Parameters<T>): Promise<ReturnType<T>[]> {
        if (this.executeAsynchronously) {
            return Promise.all(this.getHandlersPromises(emittedValue));
        } else {
            let handlerResults: ReturnType<T>[] = [];

            let promiseRejected = null;
            this.checkListenersNumber();
            for (const handler of this.handlers) {
                try {
                    handlerResults.push(await handler(emittedValue));
                } catch (e) {
                    if (promiseRejected === null) {
                        promiseRejected = Promise.reject(e);
                    }
                    console.error(e);
                }
            }

            // if one of the promises failed, return the rejection
            if (promiseRejected !== null) {
                return promiseRejected;
            }
            return handlerResults;
        }
    }

    /**
     * Triggers all listeners handlers, ignores possible rejections. The handlers will be executed in parallel or
     * sequentially based on the executeAsynchronously flag set in the constructor.
     * @param emittedValue
     */
    emit(...emittedValue: Parameters<T>): void {
        this.emitAll(...emittedValue).catch(e => {
            if (this.onError) {
                this.onError(e);
            } else {
                console.error(e);
            }
        });
    }

    // ------------------- PRIVATE API -------------------

    /**
     * Transforms the parameter array in promises array.
     * @param results
     * @private
     */
    private buildPromise(
        results: (Promise<ReturnType<T>> | ReturnType<T>)[]
    ): Promise<ReturnType<T>>[] {
        const promises: Promise<ReturnType<T>>[] = [];
        for (const res of results) {
            promises.push(
                (async (): Promise<ReturnType<T>> => {
                    return await res;
                })()
            );
        }

        return promises;
    }

    /**
     * Triggers the listeners handlers and returns an array containing their promises.
     * @param emittedValue
     * @private
     */
    private getHandlersPromises(
        emittedValue: Parameters<T>
    ): (Promise<ReturnType<T>> | ReturnType<T>)[] {
        let promises: (Promise<ReturnType<T>> | ReturnType<T>)[] = [];
        this.checkListenersNumber();
        for (const handler of this.handlers) {
            try {
                promises.push(handler(emittedValue));
            } catch (e) {
                promises.push(Promise.reject(e));
            }
        }

        return promises;
    }

    /**
     * Throws if nobody is listening and the event type is 'Error'
     * @private
     */
    private checkListenersNumber(): void {
        if (this.type === EventTypes.Error) {
            if (this.handlers.size === 0) {
                throw new Error('Nobody is listening for this event.');
            }
        }
    }
}
