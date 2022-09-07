import {StateMachine} from '../../misc/StateMachine';
import {OEvent} from '../../misc/OEvent';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    VersionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {Module, Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import oneModules from '../../generated/oneModules';
import {closeInstance} from '@refinio/one.core/lib/instance';
import RecipesStable from '../../recipes/recipes-stable';
import RecipesExperimental from '../../recipes/recipes-experimental';
import {SettingsStore} from '@refinio/one.core/lib/system/settings-store';
import {setBaseDirOrName} from '@refinio/one.core/lib/system/storage-base';

export type AuthEvent = 'login' | 'login_failure' | 'login_success' | 'logout' | 'logout_done';

export type AuthState = 'logged_out' | 'logging_in' | 'logged_in' | 'logging_out';

export type AuthenticatorOptions = {
    /** the desired storage directory or undefined **/
    directory: string | undefined;
    /**  One recipes - use all recipes if not specified **/
    recipes: Recipe[];
    /**  Reverse Maps - default is undefined  **/
    reverseMaps?: Map<OneObjectTypeNames, Set<string>>;
    /** Timeout for init storage */
    storageInitTimeout?: number;
};

/**
 *
 * Base model class for future authentication workflows/scenarios. This class contains
 * the authentication state {@link authState} and the key-value store {@link store}, exposes events
 * to external sources, and implements some common functionality you might find in any workflow/scenario.
 */
export default abstract class Authenticator {
    /**
     * This event will be triggered right AFTER the instance was initialised
     */
    public onLogin = new OEvent<(instanceName: string, secret: string, email: string) => void>();

    /**
     * This event will be triggered right BEFORE the instance was closed
     */
    public onLogout = new OEvent<() => void>();

    /**
     * JavaScript Immediately-invoked Function Expressions.
     * It returns the state machine with the registered states, events and transitions.
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
        sm.addTransition('login', 'logged_out', 'logging_in');
        sm.addTransition('login_failure', 'logging_in', 'logged_out');
        sm.addTransition('login_success', 'logging_in', 'logged_in');
        sm.addTransition('logout', 'logged_in', 'logging_out');
        sm.addTransition('logout_done', 'logging_out', 'logged_out');

        sm.setInitialState('logged_out');
        return sm;
    })();

    /**
     * Logs out the current user and erase the instance
     */
    abstract logoutAndErase(): Promise<void>;

    /**
     * Class configuration
     */
    protected config: AuthenticatorOptions;

    /**
     * SettingsStoreApi
     */
    protected store = SettingsStore;

    constructor(options: Partial<AuthenticatorOptions>) {
        setBaseDirOrName(options.directory);
        this.config = {
            directory: options.directory,
            recipes:
                options.recipes === undefined
                    ? [...RecipesStable, ...RecipesExperimental]
                    : options.recipes,
            reverseMaps: options.reverseMaps === undefined ? undefined : options.reverseMaps,
            storageInitTimeout: options.storageInitTimeout
        };
    }

    /**
     * This function will import generated modules.
     */
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

    /**
     * Logouts the user. This function will:
     *  - trigger the 'logout' event
     *  - trigger onLogout and wait for all the listeners to finish
     *  - close the instance
     *  - trigger the 'logout_done' event if it is successfully
     */
    async logout(): Promise<void> {
        this.authState.triggerEvent('logout');
        // Signal the application that it should shutdown one dependent models
        // and wait for them to shut down
        await this.onLogout.emitAll();
        closeInstance();

        this.authState.triggerEvent('logout_done');
    }
}
