import {OEvent} from './OEvent';

/**
 * Transition related data.
 */
type TransitionData<StateT> = {
    srcState: StateT;
    dstState: StateT;
    conditionStates: StateT[] | undefined;
};

export class StateMachine<StateT, EventT> {
    /**
     * Emitted when the state machine enters a new state. The enteredState
     * value represents the deepest state the state machine enters.
     */
    public onEnterState = new OEvent<(enteredState: StateT) => void>();

    /**
     * Emitted when the state machine leaves the current state. The leftState
     * value represents the deepest state the state machine leaves.
     */
    public onLeaveState = new OEvent<(leftState: StateT) => void>();

    /**
     * Emitted when the state machine executes a transition. The srcState
     * and the dstState values represent the deepest source state and
     * destination state respectively.
     */
    public onStateChange = new OEvent<
        (srcState: StateT, dstState: StateT, event: EventT) => void
    >();

    /**
     * Emitted when the state machine executes a transition. The srcStates
     * and the dstStates arrays contain the full state hierarchy, from top
     * to the bottom.
     */
    public onStatesChange = new OEvent<
        (srcStates: StateT[], dstStates: StateT[], event: EventT) => void
    >();

    /**
     * The current state.
     * @private
     */
    private crtState: StateT | null = null;

    /**
     * True if the state machine should not be reset when the parent state
     * machine leaves the associated state.
     * @private
     */
    private hasHistory = false;

    /**
     * The initial state to which the state machine resets to.
     * @private
     */
    private initialState: StateT | null = null;

    /**
     * The transitions map.
     * @private
     */
    private transitions: Map<EventT, TransitionData<StateT>[]> = new Map<
        EventT,
        TransitionData<StateT>[]
    >();

    /**
     * The events array.
     * @private
     */
    private events: EventT[] = [];

    /**
     * The states array.
     * @private
     */
    private states: StateT[] = [];

    /**
     * The map of the subStateMachines. A subStateMachine is associated to a state of
     * the state machine.
     * @private
     */
    private subStateMachines = new Map<StateT, StateMachine<StateT, EventT>>();

    /**
     * Current state of the state machine.
     */
    public get currentState(): StateT | null {
        return this.currentStates[this.currentStates.length - 1];
    }

    /**
     * Current state of the state machine as an array, including all subStateMachines
     * current states, from top to the bottom.
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
     * Set the initial state of the state machine and the history configuration.
     * @param state - the initial state.
     * @param hasHistory - rather the state machine has history or not. Defaults to false.
     */
    setInitialState(state: StateT, hasHistory = false) {
        if (!this.states.includes(state)) {
            throw Error('Invalid initial state: ' + state);
        }
        this.initialState = state;
        this.crtState = state;
        this.hasHistory = hasHistory;
    }

    /**
     * Add an event to state machine.
     * @param event - the event to be added.
     */
    addEvent(event: EventT) {
        this.events.push(event);
    }

    /**
     * Add a transition to the state machine.
     * @param event - The event which triggers the transition.
     * @param srcState - The source state of the transition.
     * @param dstState - The destination state of the transition.
     * @param conditionStates - Array of necessary states or subStates of the
     * current state machine for the transition to happen.
     */
    addTransition(event: EventT, srcState: StateT, dstState: StateT, conditionStates?: StateT[]) {
        if (!this.events.includes(event)) {
            throw Error('Invalid event for transition: ' + event);
        }

        if (!this.states.includes(srcState) || !this.states.includes(dstState)) {
            throw Error(`Invalid states for transition: ${srcState} ${dstState}`);
        }

        const transitionDatas = this.transitions.get(event);

        if (transitionDatas) {
            transitionDatas.push({
                srcState: srcState,
                dstState: dstState,
                conditionStates: conditionStates
            });
        } else {
            this.transitions.set(event, [
                {srcState: srcState, dstState: dstState, conditionStates: conditionStates}
            ]);
        }
    }

    /**
     * Triggers the given event.
     *  - If the event maps to a transition in the state machine, it will execute
     *  the transition, otherwise the event is propagated to the subStateMachines.
     * - If the given event doesn't map to a transition in the state machine
     * or its subStateMachines, it will be ignored.
     * @param event - The triggered event.
     */
    triggerEvent(event: EventT) {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }

        const transitionDatasForEvent = this.transitions.get(event);

        if (!transitionDatasForEvent) {
            // propagate event to sub state machines
            const subStateMachine = this.subStateMachines.get(this.crtState);
            if (subStateMachine) {
                const srcStates = this.currentStates;

                subStateMachine.triggerEvent(event);

                this.notifyListeners(srcStates, this.currentStates, event);

                return;
            }

            return;
        }

        const transitionsForSrcState = transitionDatasForEvent.find(transitionData => {
            return transitionData.srcState === this.crtState;
        });

        if (transitionsForSrcState) {
            if (
                transitionsForSrcState.conditionStates &&
                !transitionsForSrcState.conditionStates.some(condState =>
                    this.currentStates.includes(condState)
                )
            ) {
                // if the conditionStates exist and the state machine is not in one of the
                // condition states
                return;
            }
            const srcStates = this.currentStates;

            this.executeTransition(event, this.crtState, transitionsForSrcState.dstState);

            this.notifyListeners(srcStates, this.currentStates, event);
        }
        return;
    }

    /**
     * Reset to the initial state the stateMachine and its subStateMachines, if
     * they don't have history.
     * @param event - The event which triggered the reset.
     */
    reset(event: EventT) {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }
        if (!this.initialState) {
            throw Error('Invalid initial state.');
        }

        const subStateMachine = this.subStateMachines.get(this.crtState);

        if (subStateMachine) {
            subStateMachine.reset(event);
        }

        if (!this.hasHistory && this.crtState !== this.initialState) {
            const srcStates = this.currentStates;

            this.crtState = this.initialState;

            this.notifyListeners(srcStates, this.currentStates, event);
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
     * Creates a states array from the state machine current state and all its subStateMachines current states.
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
     * Search the given state in the current state machine and its subStateMachines recursively.
     * - if state doesn't exist in current SM or its subStateMachines -  null it's returned.
     * - if state exists in current SM or its subStateMachines - an array containing all the states
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
     * if case, depending on the state machines history configuration.
     * @param event - The event which triggered the transition.
     * @param srcState - The source state.
     * @param dstState - The destination state.
     * @private
     */
    private executeTransition(event: EventT, srcState: StateT, dstState: StateT) {
        if (!this.crtState) {
            throw Error('Invalid current state.');
        }

        this.crtState = dstState;

        // reset subStateMachines
        const subStateMachine = this.subStateMachines.get(srcState);
        if (subStateMachine) {
            subStateMachine.reset(event);
        }
    }

    /**
     * Emit the events.
     * @param srcStates - The source states, from top to the bottom.
     * @param dstStates - The destination states, from top to the bottom.
     * @param event - The event which triggered the transition.
     * @private
     */
    private notifyListeners(srcStates: StateT[], dstStates: StateT[], event: EventT) {
        this.onLeaveState.emit(srcStates[srcStates.length - 1]);
        this.onEnterState.emit(dstStates[dstStates.length - 1]);
        this.onStateChange.emit(
            srcStates[srcStates.length - 1],
            dstStates[dstStates.length - 1],
            event
        );
        this.onStatesChange.emit(srcStates, dstStates, event);
    }
}
