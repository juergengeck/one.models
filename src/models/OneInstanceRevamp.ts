import {StateMachine} from '../misc/StateMachine';
import {createMessageBus} from 'one.core/lib/message-bus';
import {LightStorage} from '../misc/lightStorage';
const MessageBus = createMessageBus('OneInstanceRevamp');

type ValueOf<T> = T[keyof T];
type AuthEvent = 'init-started' | 'init-failed' | 'init-succeeded' | 'logout-started' | 'logout-failed' | 'logout-succeeded';
type AuthState = 'uninitialized' | 'initializing' | 'initialized';

/**
 * Configuration parameters for the OneInstanceModel
 */
export type OneInstanceConfiguration = {
    // whenever the app starts, log the user in automatically
    autoLoginOnInit: boolean;
    // idle timeout to logout the user (in seconds)
    logoutIn: number;
    // creates a fresh new random instance if the user does not want to create an account
    demoAccount: boolean;
};

/**
 *
 */
export default class OneInstanceRevamp {
    private config: OneInstanceConfiguration;

    /**
     *
     * @type {Storage}
     * @private
     */
    private storage: Storage = LightStorage;

    /**
     * IIFE Function. It will return the state machine with the registered states, events &
     * transitions.
     * @type {StateMachine<AuthState, AuthEvent>}
     * @private
     */
    private stateMachine: StateMachine<AuthState, AuthEvent> = (() => {
        const sm = new StateMachine<AuthState, AuthEvent>();
        // Add the states
        sm.addState('initialized');
        sm.addState('initializing');
        sm.addState('uninitialized');

        // Add the events
        sm.addEvent('init-started');
        sm.addEvent('init-failed');
        sm.addEvent('init-succeeded');

        // Add the transitions
        sm.addTransition('init-started', 'uninitialized', 'initializing');
        sm.addTransition('init-succeeded', 'initializing', 'initialized');
        sm.addTransition('init-failed', 'initializing', 'uninitialized');
        sm.addTransition('logout-started', 'uninitialized', 'initializing');
        sm.addTransition('logout-succeeded', 'initializing', 'initialized');
        sm.addTransition('logout-failed', 'initializing', 'uninitialized');

        sm.setInitialState('uninitialized');
        return sm;
    })();

    constructor(config: Partial<OneInstanceConfiguration>) {
        this.config = {
            autoLoginOnInit: config.autoLoginOnInit !== undefined ? config.autoLoginOnInit : false,
            demoAccount: config.demoAccount !== undefined ? config.demoAccount : false,
            logoutIn: config.logoutIn !== undefined ? config.logoutIn : -1
        };
    }

    init(): void {
        this.stateMachine.triggerEvent('init-started');
        try {
            this.stateMachine.triggerEvent('init-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('init-failed');
        }
    }

    shutdown(): void {}

    login(): void {

    }

    registerWithInternetOfMe(): void {

    }

    register(): void {

    }

    logout(): void {}

    erase(): void {}

    recover(): void {}
}
