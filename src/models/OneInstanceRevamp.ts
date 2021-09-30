import {StateMachine} from '../misc/StateMachine';
import {createMessageBus} from 'one.core/lib/message-bus';
import {KeyValueStore} from '../misc/stores';
import type {Module, Recipe} from 'one.core/lib/recipes';
import {closeInstance, initInstance, registerRecipes} from 'one.core/lib/instance';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {getDbInstance} from 'one.core/lib/system/storage-base';
import {OEvent} from '../misc/OEvent';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    VersionedObjectResult
} from 'one.core/lib/storage';
import oneModules from '../generated/oneModules';
const MessageBus = createMessageBus('OneInstanceRevamp');

type AuthEvent =
    | 'init-started'
    | 'init-failed'
    | 'init-succeeded'
    | 'logout-started'
    | 'logout-failed'
    | 'logout-succeeded';

type AuthState = 'uninitialized' | 'initializing' | 'initialized' | 'shutting-down';

/**
 * Configuration parameters for the OneInstanceModel
 */
export type OneInstanceConfiguration = {
    // boolean flag to encrypt or not the ONE storage
    encryptStorage: boolean;
    // desired recipes
    recipes: Recipe[];
};

/**
 *
 */
export default class OneInstanceRevamp {
    /**
     * IIFE Function. It will return the state machine with the registered states, events &
     * transitions.
     * @type {StateMachine<AuthState, AuthEvent>}
     * @private
     */
    public stateMachine: StateMachine<AuthState, AuthEvent> = (() => {
        const sm = new StateMachine<AuthState, AuthEvent>();
        // Add the states
        sm.addState('initialized');
        sm.addState('initializing');
        sm.addState('uninitialized');
        sm.addState('shutting-down');

        // Add the events
        sm.addEvent('init-started');
        sm.addEvent('init-failed');
        sm.addEvent('init-succeeded');
        sm.addEvent('logout-started');
        sm.addEvent('logout-failed');
        sm.addEvent('logout-succeeded');

        // Add the transitions
        sm.addTransition('init-started', 'uninitialized', 'initializing');
        sm.addTransition('init-succeeded', 'initializing', 'initialized');
        sm.addTransition('init-failed', 'initializing', 'uninitialized');

        sm.addTransition('logout-started', 'initialized', 'shutting-down');
        sm.addTransition('logout-succeeded', 'shutting-down', 'uninitialized');
        sm.addTransition('logout-failed', 'shutting-down', 'initialized');

        sm.setInitialState('uninitialized');
        return sm;
    })();

    /**
     * This event is emitted just before the logout finishes and before the instance is
     * closed so that you can shutdown the models.
     */
    public onInstanceClosed = new OEvent<() => void>();

    public onInstanceStarted = new OEvent<() => void>();


    private config: OneInstanceConfiguration;

    /**
     * KeyValue Store
     * @type {Storage}
     * @private
     */
    private storage: Storage = KeyValueStore;

    /**
     *
     * @param {Partial<OneInstanceConfiguration>} config
     */
    public constructor(config: Partial<OneInstanceConfiguration>) {
        this.config = {
            encryptStorage: config.encryptStorage !== undefined ? config.encryptStorage : false,
            recipes: config.recipes !== undefined ? config.recipes : []
        };
    }

    /**
     * Login the user.
     * @param {string} name
     * @param {string} email
     * @param {string | null} secret
     * @returns {Promise<void>}
     */
    public async login(name: string, email: string, secret: string | null = null): Promise<void> {
        this.stateMachine.triggerEvent('init-started');

        try {
            await initInstance({
                name: name,
                email: email,
                secret: secret,
                encryptStorage: this.config.encryptStorage,
                ownerName: 'name' + email,
                initialRecipes: this.config.recipes
            });
            await this.importModules();
            await registerRecipes(this.config.recipes);

            await this.onInstanceStarted.emitAll();

            this.stateMachine.triggerEvent('init-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('init-failed');
            throw new Error(e.toString());
        }
    }

    /**
     * Register the user.
     * @param {string} name
     * @param {string} email
     * @param {string | null} secret
     * @returns {Promise<void>}
     */
    public async register(
        name: string,
        email: string,
        secret: string | null = null
    ): Promise<void> {
        this.stateMachine.triggerEvent('init-started');
        try {
            await initInstance({
                name: name,
                email: email,
                secret: secret,
                encryptStorage: this.config.encryptStorage,
                ownerName: 'name' + email,
                initialRecipes: this.config.recipes
            });
            await this.importModules();
            await registerRecipes(this.config.recipes);
            // persist the credentials
            this.storage.setItem('name', name);
            this.storage.setItem('email', email);
            this.storage.setItem('deviceID', await createRandomString(64));

            await this.onInstanceStarted.emitAll();

            // trigger the succeeded event
            this.stateMachine.triggerEvent('init-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('init-failed');
            throw new Error(e.toString());
        }
    }

    /**
     * Logout the user.
     * @returns {Promise<void>}
     */
    public async logout(): Promise<void> {
        this.stateMachine.triggerEvent('logout-started');

        try {
            // Signal the application that it should shutdown one dependent models
            // and wait for them to shut down
            await this.onInstanceClosed.emitAll();
            getDbInstance().close();
            closeInstance();
            this.stateMachine.triggerEvent('logout-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('logout-failed');
            throw new Error(e);
        }
    }


    /**
     *
     * @param {string} email
     * @param {string | null} secret
     * @param {string} anonEmail
     * @returns {Promise<void>}
     */
    public async registerWithInternetOfMe(
        email: string,
        secret: string | null = null,
        anonEmail: string
    ): Promise<void> {
        // WIP
    }

    public erase(): void {
        // wip
    }

    public recover(): void {
        // wip
    }

    /**
     * Retrieves the credentials from the store.
     */
    private retrieveStoredCredentials(): {name: string; deviceID: string; email: string} | null {
        const name = this.storage.get('name');
        const email = this.storage.get('email');
        const deviceID = this.storage.get('deviceID');

        if (name === null || email === null || deviceID === null) {
            return null;
        }

        return {name, email, deviceID};
    }

    /**
     * Import all plan modules.
     */
    private async importModules(): Promise<VersionedObjectResult<Module>[]> {
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
