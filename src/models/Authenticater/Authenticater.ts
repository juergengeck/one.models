import {StateMachine} from '../../misc/StateMachine';
import {KeyValueStore} from 'one.core/lib/system/key-value-store';
import {OEvent} from '../../misc/OEvent';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    VersionedObjectResult
} from 'one.core/lib/storage';
import type {Module} from 'one.core/lib/recipes';
import oneModules from '../../generated/oneModules';
import {closeInstance} from 'one.core/lib/instance';

export type AuthEvent = 'login' | 'login_failure' | 'login_success' | 'logout' | 'logout_done';

export type AuthState = 'logged_out' | 'logging_in' | 'logged_in' | 'logging_out';

export abstract class Authenticater {
    protected store: Storage = KeyValueStore;

    public onLogin = new OEvent<() => void>();

    public onLogout = new OEvent<() => void>();

    /**
     * IIFE Function. It will return the state machine with the registered states, events &
     * transitions.
     * @type {StateMachine<AuthState, AuthEvent>}
     * @private
     */
    public authState: StateMachine<AuthState, AuthEvent> = (() => {
        const sm = new StateMachine<AuthState, AuthEvent>();
        // Add the states
        sm.addState('logged_out');
        sm.addState('logging_in');
        sm.addState('logged_in');
        sm.addState('logging_out');

        // Add the events
        sm.addEvent('login');
        sm.addEvent('login_failure');
        sm.addEvent('login_success');
        sm.addEvent('logout');
        sm.addEvent('logout_done');

        // Add the transitions
        sm.addTransition('login', 'logging_out', 'logging_in');
        sm.addTransition('login_failure', 'logging_in', 'logged_out');
        sm.addTransition('login_success', 'logging_in', 'logged_in');
        sm.addTransition('logout', 'logged_in', 'logging_out');
        sm.addTransition('logout_done', 'logging_out', 'logged_out');

        sm.setInitialState('logged_out');
        return sm;
    })();

    abstract register(email: string, secret: string, instanceName: string): Promise<void>;
    abstract login(email: string, secret: string, instanceName: string): Promise<void>;
    abstract loginOrRegister(email: string, secret: string, instanceName: string): Promise<void>;
    abstract isRegistered(email: string, instanceName: string): Promise<boolean>;

    async logout(): Promise<void> {
        this.authState.triggerEvent('logout');

        try {
            // Signal the application that it should shutdown one dependent models
            // and wait for them to shut down
            await this.onLogout.emitAll();
            closeInstance();
            this.authState.triggerEvent('logout_done');
        } catch (e) {
            throw new Error(e);
        }
    }

    erase(): Promise<void> {
        this.store.clear();
        // @todo implement delete instance in core for multi platform use
        throw new Error('Not implemented.');
    }

    protected async importModules(): Promise<VersionedObjectResult<Module>[]> {
        const modules = Object.keys(oneModules).map(key => ({
            moduleName: key,
            code: oneModules[key as keyof typeof oneModules]
        }));
        return await Promise.all(
            modules.map(module =>
                createSingleObjectThroughPurePlan(
                    {
                        module: '@one/module-importer',
                        versionMapPolicy: {
                            '*': VERSION_UPDATES.NONE_IF_LATEST
                        }
                    },
                    module
                )
            )
        );
    }
}
