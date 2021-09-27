import {StateMachine} from '../misc/StateMachine';
import {createMessageBus} from 'one.core/lib/message-bus';
const MessageBus = createMessageBus('OneInstanceRevamp');

type ValueOf<T> = T[keyof T];
type AuthEvent = ValueOf<typeof INIT_EVENTS & typeof LOGOUT_EVENTS>;
type AuthState = ValueOf<typeof AUTH_STATES>;

/**
 * All the current states.
 * @type {{Authenticated: "authenticated", Unauthenticated: "unauthenticated", AccountCreation: "account-creation", Register: "register", InternetOfMe: "internet-of-me", InputCredentials: "input-credentials", Recovery: "recovery"}}
 */
const AUTH_STATES = {
    Uninitilized: 'uninitilized',
    Initializing: 'initializing',
    Initialized: 'initialized'
} as const;

/**
 * All the current events for init.
 * @type {{InitStarted: "@AUTH / AUTH_STARTED", InitSucceeded: "AUTH / AUTH_SUCCEEDED", InitFailed: "@AUTH / AUTH_FAILED"}}
 */
const INIT_EVENTS = {
    InitStarted: '@INIT / INIT_STARTED',
    InitFailed: '@INIT / INIT_FAILED',
    InitSucceeded: 'INIT / INIT_SUCCEEDED'
} as const;

/**
 * All the current events for logout.
 * @type {{InitStarted: "@AUTH / AUTH_STARTED", InitSucceeded: "AUTH / AUTH_SUCCEEDED", InitFailed: "@AUTH / AUTH_FAILED"}}
 */
const LOGOUT_EVENTS = {
    LogoutStarted: '@LOGOUT /   LOGOUT_STARTED',
    LogoutFailed: '@LOGOUT /    LOGOUT_FAILED',
    LogoutSucceeded: 'LOGOUT /  LOGOUT_SUCCEEDED'
} as const;

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
     * IIFE Function. It will return the state machine with the registered states, events &
     * transitions.
     * @type {StateMachine<AuthState, AuthEvent>}
     * @private
     */
    private state: StateMachine<AuthState, AuthEvent> = (() => {
        const stateMachine = new StateMachine<AuthState, AuthEvent>();
        // Add the states
        stateMachine.addState(AUTH_STATES.Initialized);
        stateMachine.addState(AUTH_STATES.Initializing);
        stateMachine.addState(AUTH_STATES.Uninitilized);
        // Add the events
        stateMachine.addEvent(INIT_EVENTS.InitStarted);
        stateMachine.addEvent(INIT_EVENTS.InitFailed);
        stateMachine.addEvent(INIT_EVENTS.InitSucceeded);

        // Add the transitions
        // prettier-ignore
        stateMachine.addTransition(INIT_EVENTS.InitStarted, AUTH_STATES.Uninitilized, AUTH_STATES.Initializing);
        // prettier-ignore
        stateMachine.addTransition(INIT_EVENTS.InitSucceeded, AUTH_STATES.Initializing, AUTH_STATES.Initialized);
        // prettier-ignore
        stateMachine.addTransition(INIT_EVENTS.InitFailed, AUTH_STATES.Initializing, AUTH_STATES.Uninitilized);

        // prettier-ignore
        stateMachine.addTransition(LOGOUT_EVENTS.LogoutStarted, AUTH_STATES.Uninitilized, AUTH_STATES.Initializing);
        // prettier-ignore
        stateMachine.addTransition(LOGOUT_EVENTS.LogoutSucceeded, AUTH_STATES.Initializing, AUTH_STATES.Initialized);
        // prettier-ignore
        stateMachine.addTransition(LOGOUT_EVENTS.LogoutFailed, AUTH_STATES.Initializing, AUTH_STATES.Uninitilized);

        stateMachine.setInitialState(AUTH_STATES.Uninitilized);
        return stateMachine;
    })();

    constructor(config: Partial<OneInstanceConfiguration>) {
        this.config = {
            autoLoginOnInit: config.autoLoginOnInit !== undefined ? config.autoLoginOnInit : false,
            demoAccount: config.demoAccount !== undefined ? config.demoAccount : false,
            logoutIn: config.logoutIn !== undefined ? config.logoutIn : -1
        };
    }

    init(): void {
        this.state.triggerEvent(INIT_EVENTS.InitStarted);
        try {
            this.state.triggerEvent(INIT_EVENTS.InitSucceeded);
        } catch (e) {
            this.state.triggerEvent(INIT_EVENTS.InitFailed);
        }
    }

    shutdown(): void {}

    login(): void {
        this.state.triggerEvent(INIT_EVENTS.InitStarted);
        try {
            this.state.triggerEvent(INIT_EVENTS.InitSucceeded);
        } catch (e) {
            this.state.triggerEvent(INIT_EVENTS.InitFailed);
        }
    }

    registerWithInternetOfMe(): void {
        this.state.triggerEvent(INIT_EVENTS.InitStarted);
        try {
            this.state.triggerEvent(INIT_EVENTS.InitSucceeded);
        } catch (e) {
            this.state.triggerEvent(INIT_EVENTS.InitFailed);
        }
    }

    register(): void {
        this.state.triggerEvent(INIT_EVENTS.InitStarted);
        try {
            this.state.triggerEvent(INIT_EVENTS.InitSucceeded);
        } catch (e) {
            this.state.triggerEvent(INIT_EVENTS.InitFailed);
        }
    }

    logout(): void {}

    erase(): void {}

    recover(): void {}
}
