// NOOP TS-only import - that is a .d.ts file - so that when tsc checks declaration files in
// lib/ this file is included. It looks like it was not when running tsc with the top level
// tsconfig.json, which only checks scripts/*.js but apparently it also checked lib even with
// the references to src/ and test/ removed and explicitly told (via "exclude") to ignore that
// folder. This line tells tsc to include this file so that there are no problems.
// import '../@OneObjectInterfaces';

import {StateMachine} from '../misc/StateMachine';
import {OEvent} from '../misc/OEvent';

/**
 * Model's Base Class.
 */
export abstract class Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;

    public onUpdated: OEvent<(...data: any) => void> = new OEvent<(...data: any) => void>();

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
