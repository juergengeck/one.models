/**
 * A simple, type-safe state machine implementation.
 * Manages state transitions and ensures they follow defined rules.
 *
 * @typeParam S - Union type of possible states
 * @typeParam E - Union type of possible events
 *
 * @example
 * ```typescript
 * type States = 'idle' | 'loading' | 'done';
 * type Events = 'start' | 'finish' | 'reset';
 *
 * const machine = new StateMachine<States, Events>();
 * machine.addState('idle');
 * machine.addState('loading');
 * machine.addState('done');
 * machine.setInitialState('idle');
 * machine.addTransition('start', 'idle', 'loading');
 * machine.addTransition('finish', 'loading', 'done');
 * machine.addTransition('reset', 'done', 'idle');
 * ```
 */
export class StateMachine<S extends string, E extends string> {
    /** Current state of the machine */
    public currentState: S | null = null;

    private states: Set<S> = new Set();
    private events: Set<E> = new Set();
    private transitions: Map<string, S> = new Map();

    /**
     * Adds a new state to the state machine.
     *
     * @param state - The state to add
     * @throws {Error} If the state already exists
     */
    public addState(state: S): void {
        if (this.states.has(state)) {
            throw new Error(`State '${state}' already exists`);
        }
        this.states.add(state);
    }

    /**
     * Adds a new event to the state machine.
     *
     * @param event - The event to add
     * @throws {Error} If the event already exists
     */
    public addEvent(event: E): void {
        if (this.events.has(event)) {
            throw new Error(`Event '${event}' already exists`);
        }
        this.events.add(event);
    }

    /**
     * Sets the initial state of the machine.
     *
     * @param state - The initial state
     * @throws {Error} If the state doesn't exist or if initial state was already set
     */
    public setInitialState(state: S): void {
        if (!this.states.has(state)) {
            throw new Error(`State '${state}' does not exist`);
        }
        if (this.currentState !== null) {
            throw new Error('Initial state already set');
        }
        this.currentState = state;
    }

    /**
     * Adds a transition rule to the state machine.
     *
     * @param event - The event that triggers the transition
     * @param fromState - The state to transition from
     * @param toState - The state to transition to
     * @throws {Error} If the event or states don't exist
     *
     * @example
     * ```typescript
     * machine.addTransition('start', 'idle', 'loading');
     * ```
     */
    public addTransition(event: E, fromState: S, toState: S): void {
        if (!this.events.has(event)) {
            throw new Error(`Event '${event}' does not exist`);
        }
        if (!this.states.has(fromState)) {
            throw new Error(`State '${fromState}' does not exist`);
        }
        if (!this.states.has(toState)) {
            throw new Error(`State '${toState}' does not exist`);
        }

        const key = this.getTransitionKey(event, fromState);
        if (this.transitions.has(key)) {
            throw new Error(
                `Transition for event '${event}' from state '${fromState}' already exists`
            );
        }

        this.transitions.set(key, toState);
    }

    /**
     * Triggers an event, causing a state transition if a matching rule exists.
     *
     * @param event - The event to trigger
     * @throws {Error} If the event doesn't exist or no matching transition is found
     *
     * @example
     * ```typescript
     * machine.triggerEvent('start'); // transitions from 'idle' to 'loading'
     * ```
     */
    public triggerEvent(event: E): void {
        if (this.currentState === null) {
            throw new Error('No initial state set');
        }
        if (!this.events.has(event)) {
            throw new Error(`Event '${event}' does not exist`);
        }

        const key = this.getTransitionKey(event, this.currentState);
        const nextState = this.transitions.get(key);

        if (nextState === undefined) {
            throw new Error(
                `No transition defined for event '${event}' from state '${this.currentState}'`
            );
        }

        this.currentState = nextState;
    }

    /**
     * Gets the current state of the machine.
     *
     * @returns The current state
     * @throws {Error} If no initial state was set
     */
    public getCurrentState(): S {
        if (this.currentState === null) {
            throw new Error('No initial state set');
        }
        return this.currentState;
    }

    /**
     * Checks if a transition exists for the given event from the current state.
     *
     * @param event - The event to check
     * @returns true if the transition exists, false otherwise
     */
    public canTriggerEvent(event: E): boolean {
        if (this.currentState === null) {
            return false;
        }
        const key = this.getTransitionKey(event, this.currentState);
        return this.transitions.has(key);
    }

    private getTransitionKey(event: E, fromState: S): string {
        return `${event}:${fromState}`;
    }
} 