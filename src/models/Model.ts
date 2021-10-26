import type {OEvent} from '../misc/OEvent';
import type {ObjectData} from './ChannelManager';
import {StateMachine} from '../misc/StateMachine';

/**
 * Creates the basic model's state machine.
 * The states are:
 *  - Uninitialised
 *  - Initialised
 * The events are
 *  - shutdown (Initialised -> Uninitialised)
 *  - init (Uninitialised -> Initialised)
 */
export function createModelStateMachine(): StateMachine<
    'Uninitialised' | 'Initialised',
    'shutdown' | 'init'
> {
    const sm = new StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>();
    sm.addState('Initialised');
    sm.addState('Uninitialised');
    sm.addEvent('init');
    sm.addEvent('shutdown');
    sm.addTransition('shutdown', 'Initialised', 'Uninitialised');
    sm.addTransition('init', 'Uninitialised', 'Initialised');
    sm.setInitialState('Uninitialised');
    return sm;
}

/**
 * Models interface.
 */
export interface Model {
    state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    onUpdated: OEvent<(data: ObjectData<unknown>) => void>;
    shutdown(): Promise<void>;
}
