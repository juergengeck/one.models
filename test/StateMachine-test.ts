import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import {expect} from 'chai';
import * as StorageTestInit from 'one.core/test/_helpers';
import {StateMachine} from '../lib/misc/StateMachine';
import {wait} from 'one.core/lib/util/promise';

let testModel: TestModel;

type SMStates = 'initialized' | 'not initialized' | 'A' | 'B' | 'listening' | 'not listening';
type SMEvents = 'init' | 'shutdown' | 'AtoB' | 'BtoA' | 'startListen' | 'stopListen';

function createStateMachineWithoutHistory(hasHistory: boolean): StateMachine<SMStates, SMEvents> {
    const subSMLvl2 = new StateMachine<SMStates, SMEvents>();
    subSMLvl2.addState('A');
    subSMLvl2.addState('B');
    subSMLvl2.setInitialState('A', hasHistory);
    subSMLvl2.addEvent('AtoB');
    subSMLvl2.addEvent('BtoA');
    subSMLvl2.addTransition('AtoB', 'A', 'B');
    subSMLvl2.addTransition('BtoA', 'B', 'A');

    const subSMLvl1 = new StateMachine<SMStates, SMEvents>();
    subSMLvl1.addState('listening', subSMLvl2);
    subSMLvl1.addState('not listening');
    subSMLvl1.setInitialState('not listening', hasHistory);
    subSMLvl1.addEvent('startListen');
    subSMLvl1.addEvent('stopListen');
    subSMLvl1.addTransition('startListen', 'not listening', 'listening');
    subSMLvl1.addTransition('stopListen', 'listening', 'not listening');

    const sm = new StateMachine<SMStates, SMEvents>();
    sm.addState('initialized', subSMLvl1);
    sm.addState('not initialized');
    sm.setInitialState('not initialized', hasHistory);
    sm.addEvent('shutdown');
    sm.addEvent('init');
    sm.addTransition('init', 'not initialized', 'initialized');
    sm.addTransition('shutdown', 'initialized', 'not initialized');
    sm.addTransition('shutdown', 'not initialized', 'not initialized');

    return sm;
}

describe('StateMachine test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
    });

    // @todo implement test case where transition doesn't exist for the triggered event.

    it('Trigger invalid event ', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let triggered = false;
        sm.onStateChange((state: SMStates, newState: SMStates, event: SMEvents) => {
            triggered = true;
        });

        try {
            // Trigger state machine with non-existing event
            // @ts-expect-error
            sm.triggerEvent('nonexisting_event');
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'Event is not valid in the current state.'
            );
            expect(triggered).to.be.false;
        }
    }).timeout(1000);

    it('Trigger valid event with missing transition for current state ', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let triggered = false;
        sm.onStateChange(() => {
            triggered = true;
        });

        try {
            sm.triggerEvent('startListen');
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'Event is not valid in the current state.'
            );
            expect(triggered).to.be.false;
        }
    }).timeout(1000);

    it('Check events for init', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = false;
        let onLeaveStateTriggered = false;
        let onStateChangeTriggered = false;
        let onStatesChangeTriggered = false;

        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered = true;
            expect(state).to.be.oneOf(['initialized', 'not listening']);
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered = true;
            expect(state).to.be.eql('not initialized');
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered = true;
            expect(oldState).to.be.eql('not initialized');
            expect(newState).to.be.eql('not listening');
            expect(event).to.be.eql('init');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered = true;
            expect(oldStates).to.be.eql(['not initialized']);
            expect(newStates).to.be.eql(['initialized', 'not listening']);
            expect(event).to.be.eql('init');
        });

        // trigger state machine with unexisting event
        sm.triggerEvent('init');

        await wait(100);

        expect(onEnterStateTriggered).to.be.true;
        expect(onLeaveStateTriggered).to.be.true;
        expect(onStateChangeTriggered).to.be.true;
        expect(onStatesChangeTriggered).to.be.true;
    }).timeout(1000);

    it('Check events for startListen', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        sm.triggerEvent('init');
        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.oneOf(['listening', 'A']);
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.eql('not listening');
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('not listening');
            expect(newState).to.be.eql('A');
            expect(event).to.be.eql('startListen');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['initialized', 'not listening']);
            expect(newStates).to.be.eql(['initialized', 'listening', 'A']);
            expect(event).to.be.eql('startListen');
        });

        sm.triggerEvent('startListen');

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(2);
        expect(onLeaveStateTriggered).to.be.equal(1);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    it('Check events for AtoB', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.eql('B');
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.eql('A');
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('A');
            expect(newState).to.be.eql('B');
            expect(event).to.be.eql('AtoB');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['initialized', 'listening', 'A']);
            expect(newStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(event).to.be.eql('AtoB');
        });

        sm.triggerEvent('AtoB');

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(1);
        expect(onLeaveStateTriggered).to.be.equal(1);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    it('Check events for BtoA', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');

        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.eql('A');
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.eql('B');
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('B');
            expect(newState).to.be.eql('A');
            expect(event).to.be.eql('BtoA');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(newStates).to.be.eql(['initialized', 'listening', 'A']);
            expect(event).to.be.eql('BtoA');
        });

        sm.triggerEvent('BtoA');

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(1);
        expect(onLeaveStateTriggered).to.be.equal(1);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    it('Check events for stopListen from state B', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');

        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.eql('not listening');
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.oneOf(['listening', 'B']);
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('B');
            expect(newState).to.be.eql('not listening');
            expect(event).to.be.eql('stopListen');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(newStates).to.be.eql(['initialized', 'not listening']);
            expect(event).to.be.eql('stopListen');
        });

        sm.triggerEvent('stopListen');

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(1);
        expect(onLeaveStateTriggered).to.be.equal(2);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    it('Check events for shutdown from state B', async () => {
        let sm = createStateMachineWithoutHistory(false);
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');

        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.eql('not initialized');
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.oneOf(['initialized', 'listening', 'B']);
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('B');
            expect(newState).to.be.eql('not initialized');
            expect(event).to.be.eql('shutdown');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(newStates).to.be.eql(['not initialized']);
            expect(event).to.be.eql('shutdown');
        });

        sm.triggerEvent('shutdown');

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(1);
        expect(onLeaveStateTriggered).to.be.equal(3);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    it('Check history is not kept for state machine without history', async () => {
        let sm = createStateMachineWithoutHistory(false);

        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');
        expect(sm.currentState).to.be.equal('B');
        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'B']);

        sm.triggerEvent('shutdown');
        sm.triggerEvent('init');
        expect(sm.currentState).to.be.equal('not listening');
        expect(sm.currentStates).to.be.eql(['initialized', 'not listening']);

        sm.triggerEvent('startListen');
        expect(sm.currentState).to.be.equal('A');
        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'A']);
    }).timeout(1000);

    it('Check history is kept for state machine with history', async () => {
        let sm = createStateMachineWithoutHistory(true);

        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');
        expect(sm.currentState).to.be.equal('B');
        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'B']);

        sm.triggerEvent('shutdown');
        sm.triggerEvent('init');
        expect(sm.currentState).to.be.equal('B');
        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'B']);
    }).timeout(1000);

    it('Check events are emitted for subStateMachines', async () => {
        let onEnterStateTriggeredSM = 0;
        let onLeaveStateTriggeredSM = 0;
        let onStateChangeTriggeredSM = 0;
        let onStatesChangeTriggeredSM = 0;
        let onEnterStateTriggeredLevel1 = 0;
        let onLeaveStateTriggeredLevel1 = 0;
        let onStateChangeTriggeredLevel1 = 0;
        let onStatesChangeTriggeredLevel1 = 0;
        let onEnterStateTriggeredLevel2 = 0;
        let onLeaveStateTriggeredLevel2 = 0;
        let onStateChangeTriggeredLevel2 = 0;
        let onStatesChangeTriggeredLevel2 = 0;
        const subSMLvl2 = new StateMachine<SMStates, SMEvents>();
        subSMLvl2.addState('A');
        subSMLvl2.addState('B');
        subSMLvl2.setInitialState('A', false);
        subSMLvl2.addEvent('AtoB');
        subSMLvl2.addEvent('BtoA');
        subSMLvl2.addTransition('AtoB', 'A', 'B');
        subSMLvl2.addTransition('BtoA', 'B', 'A');

        const subSMLvl1 = new StateMachine<SMStates, SMEvents>();
        subSMLvl1.addState('listening', subSMLvl2);
        subSMLvl1.addState('not listening');
        subSMLvl1.setInitialState('not listening', false);
        subSMLvl1.addEvent('startListen');
        subSMLvl1.addEvent('stopListen');
        subSMLvl1.addTransition('startListen', 'not listening', 'listening');
        subSMLvl1.addTransition('stopListen', 'listening', 'not listening');

        const sm = new StateMachine<SMStates, SMEvents>();
        sm.addState('initialized', subSMLvl1);
        sm.addState('not initialized');
        sm.setInitialState('not initialized', false);
        sm.addEvent('shutdown');
        sm.addEvent('init');
        sm.addTransition('init', 'not initialized', 'initialized');
        sm.addTransition('shutdown', 'initialized', 'not initialized');
        sm.addTransition('shutdown', 'not initialized', 'not initialized');

        sm.triggerEvent('init');
        sm.triggerEvent('startListen');

        sm.onEnterState((enteredState: SMStates) => {
            onEnterStateTriggeredSM++;
            expect(enteredState).to.be.equal('B');
        });
        sm.onLeaveState((leftState: SMStates) => {
            onLeaveStateTriggeredSM++;
            expect(leftState).to.be.equal('A');
        });

        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggeredSM++;
            expect(oldState).to.be.equal('A');
            expect(newState).to.be.equal('B');
            expect(event).to.be.equal('AtoB');
        });

        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggeredSM++;
            expect(oldStates).to.be.eql(['initialized', 'listening', 'A']);
            expect(newStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(event).to.be.equal('AtoB');
        });
        subSMLvl1.onEnterState((enteredState: SMStates) => {
            onEnterStateTriggeredLevel1++;
            expect(enteredState).to.be.equal('B');
        });
        subSMLvl1.onLeaveState((leftState: SMStates) => {
            onLeaveStateTriggeredLevel1++;
            expect(leftState).to.be.equal('A');
        });
        subSMLvl1.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggeredLevel1++;
            expect(oldState).to.be.equal('A');
            expect(newState).to.be.equal('B');
            expect(event).to.be.equal('AtoB');
        });
        subSMLvl1.onStatesChange(
            (oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
                onStatesChangeTriggeredLevel1++;
                expect(oldStates).to.be.eql(['listening', 'A']);
                expect(newStates).to.be.eql(['listening', 'B']);
                expect(event).to.be.equal('AtoB');
            }
        );
        subSMLvl2.onEnterState((enteredState: SMStates) => {
            onEnterStateTriggeredLevel2++;
            expect(enteredState).to.be.equal('B');
        });
        subSMLvl2.onLeaveState((leftState: SMStates) => {
            onLeaveStateTriggeredLevel2++;
            expect(leftState).to.be.equal('A');
        });
        subSMLvl2.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggeredLevel2++;
            expect(oldState).to.be.equal('A');
            expect(newState).to.be.equal('B');
            expect(event).to.be.equal('AtoB');
        });
        subSMLvl2.onStatesChange(
            (oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
                onStatesChangeTriggeredLevel2++;
                expect(oldStates).to.be.eql(['A']);
                expect(newStates).to.be.eql(['B']);
                expect(event).to.be.equal('AtoB');
            }
        );
        sm.triggerEvent('AtoB');

        await wait(100);

        expect(onEnterStateTriggeredSM).to.be.equal(1);
        expect(onLeaveStateTriggeredSM).to.be.equal(1);
        expect(onStateChangeTriggeredSM).to.be.equal(1);
        expect(onStatesChangeTriggeredSM).to.be.equal(1);
        expect(onEnterStateTriggeredLevel1).to.be.equal(1);
        expect(onLeaveStateTriggeredLevel1).to.be.equal(1);
        expect(onStateChangeTriggeredLevel1).to.be.equal(1);
        expect(onStatesChangeTriggeredLevel1).to.be.equal(1);
        expect(onEnterStateTriggeredLevel2).to.be.equal(1);
        expect(onLeaveStateTriggeredLevel2).to.be.equal(1);
        expect(onStateChangeTriggeredLevel2).to.be.equal(1);
        expect(onStatesChangeTriggeredLevel2).to.be.equal(1);
    }).timeout(1000);

    it('Check transition from substate to parent', async () => {
        const subSMLvl2 = new StateMachine<SMStates, SMEvents>();
        subSMLvl2.addState('A');
        subSMLvl2.addState('B');
        subSMLvl2.setInitialState('A', false);
        subSMLvl2.addEvent('AtoB');
        subSMLvl2.addEvent('BtoA');
        subSMLvl2.addTransition('AtoB', 'A', 'B');
        subSMLvl2.addTransition('BtoA', 'B', 'A');

        const subSMLvl1 = new StateMachine<SMStates, SMEvents>();
        subSMLvl1.addState('listening', subSMLvl2);
        subSMLvl1.addState('not listening');
        subSMLvl1.setInitialState('not listening', false);
        subSMLvl1.addEvent('startListen');
        subSMLvl1.addEvent('stopListen');
        subSMLvl1.addTransition('startListen', 'not listening', 'listening');
        subSMLvl1.addTransition('stopListen', 'listening', 'not listening');

        const sm = new StateMachine<SMStates, SMEvents>();
        sm.addState('initialized', subSMLvl1);
        sm.addState('not initialized');
        sm.setInitialState('not initialized', false);
        sm.addEvent('shutdown');
        sm.addEvent('init');
        sm.addTransition('init', 'not initialized', 'initialized');
        sm.addTransition('shutdown', 'B', 'not initialized');
        sm.addTransition('shutdown', 'not initialized', 'not initialized');

        sm.triggerEvent('init');
        sm.triggerEvent('startListen');
        sm.triggerEvent('AtoB');
        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'B']);

        sm.triggerEvent('shutdown');

        expect(sm.currentStates).to.be.eql(['not initialized']);
    }).timeout(1000);

    it('Check transition from parent to subState', async () => {
        let onEnterStateTriggered = 0;
        let onLeaveStateTriggered = 0;
        let onStateChangeTriggered = 0;
        let onStatesChangeTriggered = 0;
        const subSMLvl2 = new StateMachine<SMStates, SMEvents>();
        subSMLvl2.addState('A');
        subSMLvl2.addState('B');
        subSMLvl2.setInitialState('A', false);
        subSMLvl2.addEvent('AtoB');
        subSMLvl2.addEvent('BtoA');
        subSMLvl2.addTransition('AtoB', 'A', 'B');
        subSMLvl2.addTransition('BtoA', 'B', 'A');

        const subSMLvl1 = new StateMachine<SMStates, SMEvents>();
        subSMLvl1.addState('listening', subSMLvl2);
        subSMLvl1.addState('not listening');
        subSMLvl1.setInitialState('not listening', false);
        subSMLvl1.addEvent('startListen');
        subSMLvl1.addEvent('stopListen');
        subSMLvl1.addTransition('startListen', 'not listening', 'listening');
        subSMLvl1.addTransition('stopListen', 'listening', 'not listening');

        const sm = new StateMachine<SMStates, SMEvents>();
        sm.addState('initialized', subSMLvl1);
        sm.addState('not initialized');
        sm.setInitialState('not initialized', false);
        sm.addEvent('shutdown');
        sm.addEvent('init');
        sm.addTransition('init', 'not initialized', 'B');
        sm.addTransition('shutdown', 'initialized', 'not initialized');
        sm.addTransition('shutdown', 'not initialized', 'not initialized');

        expect(sm.currentStates).to.be.eql(['not initialized']);

        sm.onEnterState((state: SMStates) => {
            onEnterStateTriggered++;
            expect(state).to.be.oneOf(['initialized', 'listening', 'B']);
        });
        sm.onLeaveState((state: SMStates) => {
            onLeaveStateTriggered++;
            expect(state).to.be.eql('not initialized');
        });
        sm.onStateChange((oldState: SMStates, newState: SMStates, event: SMEvents) => {
            onStateChangeTriggered++;
            expect(oldState).to.be.eql('not initialized');
            expect(newState).to.be.eql('B');
            expect(event).to.be.eql('init');
        });
        sm.onStatesChange((oldStates: SMStates[], newStates: SMStates[], event: SMEvents) => {
            onStatesChangeTriggered++;
            expect(oldStates).to.be.eql(['not initialized']);
            expect(newStates).to.be.eql(['initialized', 'listening', 'B']);
            expect(event).to.be.eql('init');
        });
        sm.triggerEvent('init');

        expect(sm.currentStates).to.be.eql(['initialized', 'listening', 'B']);

        await wait(100);

        expect(onEnterStateTriggered).to.be.equal(3);
        expect(onLeaveStateTriggered).to.be.equal(1);
        expect(onStateChangeTriggered).to.be.equal(1);
        expect(onStatesChangeTriggered).to.be.equal(1);
    }).timeout(1000);

    after(async () => {
        await wait(1000);
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });
});
