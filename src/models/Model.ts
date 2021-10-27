import {StateMachine} from '../misc/StateMachine';
import {OEvent} from '../misc/OEvent';

/**
 * Model's Base Class.
 */
export abstract class Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;

    public onUpdated: OEvent<(...data: any) => void> = new OEvent<
        (...data: any) => void
        >();

    constructor() {
        this.state = new StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>();
        this.state.addState('Initialised');
        this.state.addState('Uninitialised');
        this.state.addEvent('init');
        this.state.addEvent('shutdown');
        this.state.addTransition('shutdown', 'Initialised', 'Uninitialised');
        this.state.addTransition('init', 'Uninitialised', 'Initialised');
        this.state.setInitialState('Uninitialised');
    }

    abstract shutdown(): Promise<void>;
}
