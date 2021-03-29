import {OEvent} from './OEvent';

interface TransitionData<StateT> {
    srcState: StateT;
    dstState: StateT;
    levelCount: number;
}

export class StateMachine<StateT, EventT> {
    /**
     * Emitted when the state machine enters a new state.
     */
    public onEnterState = new OEvent<(state: StateT) => void>();

    /**
     * Emitted when the state machine leaves the current state.
     */
    public onLeaveState = new OEvent<(state: StateT) => void>();

    /**
     * Emitted when the state machine executes a transition.
     */
    public onStateChange = new OEvent<
        (oldState: StateT, newState: StateT, event: EventT) => void
    >();

    /**
     * Emitted when the state machine executes a transition.
     */
    public onStatesChange = new OEvent<
        (oldState: StateT[], newState: StateT[], event: EventT) => void
    >();

    /**
     * The current state.
     * @private
     */
    private crtState: StateT | null = null;

    /**
     * The initial state to which the state machine resets to.
     * @private
     */
    private initialState: StateT | null = null;

    private transitions: Map<EventT, TransitionData<StateT>[]> = new Map<
        EventT,
        TransitionData<StateT>[]
    >();

    private events: EventT[] = [];
    private states: StateT[] = [];

    private subStateMachines = new Map<StateT, StateMachine<StateT, EventT>>();

    /**
     * Current state of the state machine.
     */
    public get currentState(): StateT | null {
        return this.crtState;
    }

    /**
     * Current state of the state machine, including all subStateMachines current states.
     */
    public get currentStates(): StateT[] {
        return this.getCurrentStates();
    }

    /**
     * Add a new state to the state machine. If the subStateMachine parameter is present, it
     * means the given state has subStates, represented by the given subStateMachine.
     * @param state - The state to be added.
     * @param subStateMachine - The subStateMachine associated with the given state.
     */
    addState(state: StateT, subStateMachine?: StateMachine<StateT, EventT>) {
        this.states.push(state);

        if (subStateMachine) {
            this.subStateMachines.set(state, subStateMachine);
        }
    }

    /**
     * Set the initial state of the state machine.
     * @param state
     */
    setInitialState(state: StateT) {
        if (!this.states.includes(state)) {
            throw Error('Invalid initial state: ' + state);
        }
        this.initialState = state;
        this.crtState = state;
    }

    /**
     * Add an event to state machine.
     * @param event
     */
    addEvent(event: EventT) {
        this.events.push(event);
    }

    /**
     * Add a transition to the state machine.
     * @param event - The event which triggers the transition.
     * @param srcState - The source state of the transition.
     * @param dstState - The destination state of the transition.
     * @param levelCount - The number of levels to be reset when
     * the transition is executed: 0 - none, -1 = all subStateMachines.
     */
    addTransition(event: EventT, srcState: StateT, dstState: StateT, levelCount = 0) {
        if (!this.events.includes(event)) {
            throw Error('Invalid event for transition: ' + event);
        }

        if (!this.states.includes(srcState) || !this.states.includes(dstState)) {
            throw Error(`Invalid states for transition: ${srcState} ${dstState}`);
        }

        const transitionsForEvent = this.transitions.get(event);
        if (transitionsForEvent) {
            transitionsForEvent.push({
                srcState: srcState,
                dstState: dstState,
                levelCount: levelCount
            });
        } else {
            this.transitions.set(event, [
                {srcState: srcState, dstState: dstState, levelCount: levelCount}
            ]);
        }
    }

    /**
     * Triggers an event. If the event maps to a transition in the state machine,
     * it will execute the transition, otherwise the event is propagated to the
     * subStateMachines.
     * @param event - the triggered event.
     */
    triggerEvent(event: EventT) {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }

        const transitionsForEvent = this.transitions.get(event);

        if (!transitionsForEvent) {
            // propagate event to sub state machines
            for (const [state, subStateMachine] of this.subStateMachines.entries()) {
                if (state === this.crtState) {
                    subStateMachine.triggerEvent(event);
                    if (!subStateMachine.crtState) {
                        throw Error('Invalid current state.');
                    }
                }
            }
            return;
        }

        const transitionsForSrcState = transitionsForEvent.find(
            transition => transition.srcState === this.crtState
        );
        if (transitionsForSrcState) {
            this.executeTransition(
                event,
                transitionsForSrcState.srcState,
                transitionsForSrcState.dstState,
                transitionsForSrcState.levelCount
            );
        }
    }

    /**
     * Reset to the initial state the stateMachine and its subStateMachines. The levels of subStateMachines
     * to be reset are set through the parameter:
     *  - levelCount === -1 - all subStateMachines will be reset to initial state.
     *  - levelCount === 0 - no subStateMachine will be reset.
     *  - levelCount >0 - specified levels of subStateMachines will be reset to intial state.
     * @param levelCount - number of subStateMachine levels to be reset
     */
    reset(levelCount: number) {
        if (!this.initialState) {
            throw Error('Invalid initial state.');
        }

        this.crtState = this.initialState;

        if (levelCount === 0) {
            return;
        }

        for (const subStateMachine of this.subStateMachines.values()) {
            subStateMachine.reset(levelCount--);
        }
    }

    /**
     * Search for the state in the subStateMachines.
     *
     * Returns an array of states, from top to the bottom, the last state
     * in the array being the state given as parameter.
     * @param state - The state to be located. Will be the last in the array.
     */
    locateState(state: StateT): StateT[] {
        const localState = this.locateStateRecursively(state, this, []);

        if (!localState) {
            throw Error('Could not localize state: ' + state);
        }

        return localState.reverse();
    }

    // ------------------------------- PRIVATE API -------------------------------

    /**
     * Creates a states array from the state machine current state and all the subStateMachines current states.
     * @param currentStates
     */
    private getCurrentStates(currentStates?: StateT[]): StateT[] {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }
        if (!currentStates) {
            currentStates = [];
        }
        currentStates.push(this.crtState);

        const subMachine = this.subStateMachines.get(this.crtState);

        if (subMachine) {
            if (!subMachine.crtState) {
                throw Error('Invalid current state.');
            }

            return subMachine.getCurrentStates(currentStates);
        }

        return currentStates;
    }

    /**
     * Search the given state in the current state machine and all sub state machines recursively.
     * - state doesn't exist in current SM or its subStateMachines -  null it's returned.
     * - state exists in current SM or its subStateMachines - an array containing all the states
     * its returned, states being ordered from the bottom to the top.
     * @param searchedState - the state to be located.
     * @param stateMachine - the state machine to search the state into.
     * @param states - the result states array.
     * @private
     */
    private locateStateRecursively(
        searchedState: StateT,
        stateMachine: StateMachine<StateT, EventT>,
        states: StateT[]
    ): StateT[] | null {
        if (stateMachine.states.includes(searchedState)) {
            states.push(searchedState);
            return states;
        }

        if (stateMachine.subStateMachines.size === 0) {
            return null;
        }

        for (const [state, subStateMachine] of stateMachine.subStateMachines.entries()) {
            const returnStates = this.locateStateRecursively(
                searchedState,
                subStateMachine,
                states
            );

            if (returnStates !== null) {
                states.push(state);
                return states;
            }
        }

        return null;
    }

    /**
     * Executes a transition by updating the current state and resets the subStateMachines,
     * if case.
     * @param event - the event which triggered the transition.
     * @param srcState - the source state.
     * @param dstState - the destination state.
     * @param levelCount - number of subStateMachine levels to be reset.
     * @private
     */
    private executeTransition(
        event: EventT,
        srcState: StateT,
        dstState: StateT,
        levelCount: number
    ) {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }

        const oldStates = this.getCurrentStates();

        this.crtState = dstState;

        // reset subStateMachines
        if (levelCount !== 0) {
            const subStateMachine = this.subStateMachines.get(srcState);
            if (subStateMachine) {
                subStateMachine.reset(levelCount - 1);
            }
        }

        const newStates = this.getCurrentStates();

        this.onLeaveState.emit(srcState);
        this.onEnterState.emit(dstState);
        this.onStateChange.emit(srcState, dstState, event);
        this.onStatesChange.emit(oldStates, newStates, event);
    }
}
