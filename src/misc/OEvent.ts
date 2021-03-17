/**
 * Represents the behaviour when there are no listeners.
 * <br>
 *      -> Default - does nothing if no listener is registered.<br>
 *      -> Error - throws if no one is listening.<br>
 */
export enum EventTypes {
    Default,
    Error,
    ExactlyOneListener
}

export type OEventType<T extends (...arg: any) => any> = OEvent<T>['connect'] & OEventI<T>;

/**
 * Emit functions for events.
 */
export interface OEventI<T extends (...arg: any) => any> {
    /**
     * Returns the first settled promise from listeners handlers.
     *
     * NOTE: It behaves like Promise.race().
     *
     * @param emittedValue
     */
    emitRace(...emittedValue: Parameters<T>): Promise<ReturnType<T>>;

    /**
     * Triggers all listeners handlers. In the case of rejections, it passes them to the onError callback; if the
     * onError callback is not registered, it prints it to console.error. The handlers will be executed in parallel
     * or sequentially based on the executeSequentially flag set in the constructor.
     * @param emittedValue
     */
    emit(...emittedValue: Parameters<T>): void;

    /**
     * Returns a promise that resolves to array of results of listeners handlers. The handlers will be executed in
     * parallel or sequentially based on the executeSequentially flag set in the constructor.
     *
     * @param emittedValue
     */
    emitAll(...emittedValue: Parameters<T>): Promise<ReturnType<T>[]>;

    /**
     * Returns the number of the listeners handlers registered for the event.
     */
    getListenersCount(): number;
}

/**
 * Events handling class. Interface provides possibility to register handlers for an event and to emit it. There are 3
 * possible emit options:
 *
 * - emit - Use when the emitter doesn't care about the result of the execution of the listeners handlers.
 * - emitAll - Use when the emitter is interested in the results of the listeners handlers execution.
 * - emitRace - Use when the emitter is interested only in the first settled promise from the listeners handlers.
 *
 * Executing handlers sequentially vs parallelly:
 * -----------------------------------------------
 * emit & emitAll offer the possibility to execute the listeners handlers in parallel or sequentially.This is
 * configurable through the 'executeSequentially' optional parameter in the constructor. 'executeSequentially'
 * defaults to true.
 * - executeSequentially === true: If an event handler is disconnected from another event handler then the other handler
 * will not be called if it didn't run, yet. If a new one is connected it will be executed as last event handler.<br>
 * - executeSequentially === false: If an event handler is disconnected from another event handler then the other
 * handler will still be called (it already started because of being executed in parallel) - If one is connected in another event
 * handler it will not be called.
 *
 * Usage:
 * ------
 *
 * ``` typescript
 *  class CoffeeMachine {

 *      // Event that signals when the coffee machine is powered on / off.
 *      // state: true when powered on, false when powered off.
 *      public onPowerChange = createEvent<(state: boolean) => void>();
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
 *  const disconnect = coffeeMachine.onPowerChange(state => {
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
 */
export class OEvent<T extends (...arg: any) => any> implements OEventI<T> {
    public onError: ((err: any) => void) | null = null;

    private handlers = new Set<
        (...args: Parameters<T>) => Promise<ReturnType<T>> | ReturnType<T>
    >();
    private readonly type: EventTypes;
    private readonly executeSequentially: boolean;

    /**
     * Create a OEvent object.
     * @param type - defines if the emit functions will throw if no one is listening.
     * @param executeSequentially
     */
    constructor(type: EventTypes, executeSequentially: boolean) {
        this.type = type;
        this.executeSequentially = executeSequentially;
    }

    /**
     * Registers a callback to be executed when the event is emitted. Returns the handler for unregistration.
     * @param callback - The callback to be executed when the event is emitted.
     */
    public connect(
        callback: (...args: Parameters<T>) => Promise<ReturnType<T>> | ReturnType<T>
    ): () => void {
        if (this.handlers.has(callback)) {
            console.error('callback already registered');
        }
        if (this.type === EventTypes.ExactlyOneListener && this.handlers.size > 0) {
            throw new Error('There already is a listener for this event.');
        }
        this.handlers.add(callback);
        return () => {
            const found = this.handlers.delete(callback);
            if (!found) {
                console.error('callback was not registered');
            }
        };
    }

    emitRace(...emittedValue: Parameters<T>): Promise<ReturnType<T>> {
        const handlersPromises = this.getHandlersPromises(emittedValue);

        return Promise.race(this.buildPromise(handlersPromises));
    }

    async emitAll(emittedValue: Parameters<T>): Promise<ReturnType<T>[]> {
        if (!this.executeSequentially) {
            return Promise.all(this.getHandlersPromises(emittedValue));
        }
        let handlerResults: ReturnType<T>[] = [];

        let promiseRejected = null;
        this.checkListenersNumber();

        for (const handler of this.handlers) {
            try {
                // need to run the handlers in sequence
                handlerResults.push(await handler(...emittedValue));
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

    emit(...emittedValue: Parameters<T>): void {
        this.emitAll(emittedValue).catch(e => {
            if (this.onError) {
                this.onError(e);
            } else {
                console.error(e);
            }
        });
    }

    getListenersCount(): number {
        return this.handlers.size;
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
                promises.push(handler(...emittedValue));
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
        if (this.type === EventTypes.Error && this.handlers.size === 0) {
            throw new Error('Nobody is listening for this event.');
        }
    }
}

/**
 * Convenience wrapper function over the OEvent class to be used for event handling. Please see {@link OEvent}
 *
 * The convenience wrapper wraps the OEvent class in such a way, that when connecting to an event the user can write:
 * ```
 * oevent( () => {} )
 * ```
 * instead of
 * ```
 * oevent.connect( () => {})
 * ```
 *
 * It kind of overloads the parenthesis operator of the OEvent class, by creating a function object that then inherits
 * the method properties from the class.
 *
 *  @param type - The event type - Default or Error. The default value is EventTypes.Default.
 *  @param executeSequentially - Specifies if the registered handlers will be executed sequentially or not.
 *
 */
export function createEvent<T extends (...arg: any) => any>(
    type: EventTypes = EventTypes.Default,
    executeSequentially = true
): OEvent<T>['connect'] & OEventI<T> {
    const oEvent = new OEvent<T>(type, executeSequentially);

    function parenthesisOperator(
        callback: (...args: Parameters<T>) => Promise<ReturnType<T>> | ReturnType<T>
    ): () => void {
        return oEvent.connect(callback);
    }

    parenthesisOperator.emit = (...args: Parameters<T>) => {
        oEvent.emit(...args);
    };

    parenthesisOperator.emitRace = (...args: Parameters<T>) => {
        return oEvent.emitRace(...args);
    };
    parenthesisOperator.emitAll = (...args: Parameters<T>) => {
        return oEvent.emitAll(args);
    };

    parenthesisOperator.getListenersCount = () => {
        return oEvent.getListenersCount();
    };

    return parenthesisOperator;
}
