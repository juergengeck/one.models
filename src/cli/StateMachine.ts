import readline from 'readline';
import {StateMachine} from '../misc/StateMachine';

export type GeneralSMStates =
    | 'initialized'
    | 'not initialized'
    | 'A'
    | 'B'
    | 'listening'
    | 'not listening';
export type GeneralSMEvents = 'init' | 'shutdown' | 'AtoB' | 'BtoA';
type SMEvents = GeneralSMEvents | 'startListen' | 'stopListen';

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    // Describe state machine
    const subSMLvl2 = new StateMachine<GeneralSMStates, SMEvents>();
    subSMLvl2.addState('A');
    subSMLvl2.addState('B');
    subSMLvl2.setInitialState('A');
    subSMLvl2.addEvent('AtoB');
    subSMLvl2.addEvent('BtoA');
    subSMLvl2.addTransition('AtoB', 'A', 'B');
    subSMLvl2.addTransition('BtoA', 'B', 'A');

    const subSMLvl1 = new StateMachine<GeneralSMStates, SMEvents>();
    subSMLvl1.addState('listening', subSMLvl2);
    subSMLvl1.addState('not listening');
    subSMLvl1.setInitialState('not listening');
    subSMLvl1.addEvent('startListen');
    subSMLvl1.addEvent('stopListen');
    subSMLvl1.addTransition('startListen', 'not listening', 'listening', 1);
    subSMLvl1.addTransition('stopListen', 'listening', 'not listening', 1);

    const sm = new StateMachine<GeneralSMStates, SMEvents>();
    sm.addState('initialized', subSMLvl1);
    sm.addState('not initialized');
    sm.setInitialState('not initialized');
    sm.addEvent('shutdown');
    sm.addEvent('init');
    sm.addTransition('init', 'not initialized', 'initialized', 1);
    sm.addTransition('shutdown', 'initialized', 'not initialized', 1);
    sm.addTransition('shutdown', 'not initialized', 'not initialized', 1);

    console.log('Localize B', sm.locateState('B'));

    // ######## CONSOLE I/O ########

    // Setup console for triggering events
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Stop everything at sigint
    function sigintHandler() {
        rl.close();
    }

    rl.on('SIGINT', sigintHandler);
    process.on('SIGINT', sigintHandler);

    sm.onEnterState(state => {
        console.log('ENTER STATE: ' + state);
    });
    sm.onLeaveState(state => {
        console.log('LEAVE STATE: ' + state);
    });

    sm.onStateChange((oldState, newState, event) => {
        console.log(
            'STATE CHANGE: [oldState] = ' +
                oldState +
                ' [newState] = ' +
                newState +
                ' [event] = ' +
                event
        );
    });

    sm.onStatesChange((oldStates, newStates, event) => {
        console.log(
            'STATES CHANGE: [oldState] = ' +
                oldStates +
                ' [newState] = ' +
                newStates +
                ' [event] = ' +
                event
        );
    });

    // Read from stdin
    for await (const line of rl) {
        console.log('====================================================');

        //console.log('StateMachine: ', sm);
        sm.triggerEvent(<SMEvents>line);
        console.log('1. sm Current STATE:', sm.currentState);
        console.log('1. sm Current States: ', sm.currentStates);

        console.log('2. subSMLvl1 Current STATE:', subSMLvl1.currentState);
        console.log('2. subSMLvl1 Current States: ', subSMLvl1.currentStates);

        console.log('3. subSMLvl2 Current STATE:', subSMLvl2.currentState);
        console.log('3. subSMLvl2 Current States: ', subSMLvl2.currentStates);
    }
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString());
});
