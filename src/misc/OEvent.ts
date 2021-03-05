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
 * Events handling class. Interface provides possibility to register handlers for an event and to emit it. There are 3
 * possible emit options:
 *
 * - emit - Use when the emitter doesn't care about the result of the execution of the listeners handlers.
 * - emitAll - Use when the emitter is interested in the results of the listeners handlers execution.
 * - emitRace - Use when the emitter is interested only in the first settled promise from the listeners handlers.
 *
 * Executing handlers synchronously vs asynchronously:
 * -----------------------------------------------
 * emit & emitAll offer the possibility to execute the listeners handlers in parallel or sequentially.This is
 * configurable through the 'executeAsynchronously' optional parameter in the constructor. 'executeAsynchronously'
 * defaults to false.
 * - executeAsynchronously === false: If an event handler is disconnected from another event handler then the other handler
 * will not be called if it didn't run, yet. If a new one is connected it will be executed as last event handler.<br>
 * - executeAsynchronously === true: If an event handler is disconnected from another event handler then the other
 * handler will still be called (it already started because of being asynchronous) - If one is connected in another event
 * handler it will not be called.
 *
 * Usage:
 * ------
 * ```typescript
 *  class CoffeeMachine {

 *      // Event that signals when the coffee machine is powered on / off.
 *      // state: true when powered on, false when powered off.
 *      public onPowerChange = new OEvent<(state: boolean) => void>();
 *
 *      // Turns the coffee machine on
 *      public turnOn() {
 *          //..
 *          this.onPowerChange.emit(true);
 *      }
 *
 *      // Turns the coffee machine off
 *      public turnOff() {
 *          //..
 *          this.onPowerChange.emit(false);
 *      }
 *  }
 *
 *  // Use the events provided by the class:
 *  const coffeeMachine = new CoffeeMachine();
 *  const disconnect = coffeeMachine.onPowerChange.connect(state => {
 *      if (state) {
 *          console.log('Coffee machine was turned on')
 *      } else {
 *          console.log('Coffee machine was turned off')
 *      }
 *  });
 *
 *  coffeeMachine.turnOn(); // This will print 'Coffee machine was turned on'
 *  coffeeMachine.turnOff(); // This will print 'Coffee machine was turned off'
 *  disconnect(); // This will disconnect the connection
 *  coffeeMachine.turnOn(); // This will print nothing
 *  coffeeMachine.turnOff(); // This will print nothing
 * ```
 *
 * OEvent is chosen as class name over Event, because the second option is reserved.
 **/
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
    constructor(type: EventTypes = EventTypes.Default, executeAsynchronously = false) {
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
     * Triggers all listeners handlers. In the case of rejections, it passes them to the onError callback; if the
     * onError callback is not registered, it prints it to console.error. The handlers will be executed in parallel
     * or sequentially based on the executeAsynchronously flag set in the constructor.
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

        // eliminate undeterministic behaviour
        const handlersSet = [...this.handlers];

        for (const handler of handlersSet) {
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
