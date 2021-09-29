import {StateMachine} from '../misc/StateMachine';
import {createMessageBus} from 'one.core/lib/message-bus';
import {KeyValueStore} from '../misc/stores';
import type {Module, Recipe} from 'one.core/lib/recipes';
import {closeInstance, initInstance} from 'one.core/lib/instance';
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
    | 'logout-succeeded'
    | 'iom-init-started'
    | 'iom-init-failed'
    | 'iom-init-succeeded';

type AuthState = 'uninitialized' | 'initializing' | 'initialized';

/**
 * Configuration parameters for the OneInstanceModel
 */
export type OneInstanceConfiguration = {
    // boolean flag to encrypt or not the ONE storage
    encryptStorage: boolean;
    // desired recipes
    recipes: Recipe[];
    // creates a fresh new random instance if the user does not want to create an account
    starterAccount: boolean;
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
    protected stateMachine: StateMachine<AuthState, AuthEvent> = (() => {
        const sm = new StateMachine<AuthState, AuthEvent>();
        // Add the states
        sm.addState('initialized');
        sm.addState('initializing');
        sm.addState('uninitialized');

        // Add the events
        sm.addEvent('init-started');
        sm.addEvent('init-failed');
        sm.addEvent('init-succeeded');
        sm.addEvent('logout-started');
        sm.addEvent('logout-failed');
        sm.addEvent('logout-succeeded');
        sm.addEvent('iom-init-started');
        sm.addEvent('iom-init-failed');
        sm.addEvent('iom-init-succeeded');

        // Add the transitions
        sm.addTransition('init-started', 'uninitialized', 'initializing');
        sm.addTransition('init-succeeded', 'initializing', 'initialized');
        sm.addTransition('init-failed', 'initializing', 'uninitialized');
        sm.addTransition('logout-started', 'uninitialized', 'initializing');
        sm.addTransition('logout-succeeded', 'initializing', 'initialized');
        sm.addTransition('logout-failed', 'initializing', 'uninitialized');
        sm.addTransition('iom-init-started', 'uninitialized', 'initializing');
        sm.addTransition('iom-init-succeeded', 'initializing', 'initialized');
        sm.addTransition('iom-init-failed', 'initializing', 'uninitialized');

        sm.setInitialState('uninitialized');
        return sm;
    })();

    /**
     * Listening interface for external modules
     * @type {OEvent<(enteredState: StateT) => void>}
     */
    public onEnterState = this.stateMachine.onEnterState;

    /**
     * This event is emitted just before the logout finishes and before the instance is
     * closed so that you can shutdown the models.
     */
    public beforeLogout = new OEvent<() => void>();

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
            recipes: config.recipes !== undefined ? config.recipes : [],
            starterAccount: config.starterAccount !== undefined ? config.starterAccount : false
        };
    }

    /**
     *
     */
    public init(): void {
        const creds = this.retrieveStoredCredentials();
        if (this.config.starterAccount) {
            // you don't need to know when this promise gets resolved, because the needed event
            // will be emitted already by calling login() or register()
            new Promise<void>(async (resolve, rejected) => {
                if (creds !== null) {
                    const {name, email} = creds;
                    await this.login(name, email);
                } else {
                    const randomEmail = await createRandomString(64);
                    const randomInstanceName = await createRandomString(64);
                    await this.register(randomInstanceName, randomEmail);
                }
                resolve();
            })
                .then(_ => {})
                .catch(err => {
                    throw new Error(err);
                });
        }
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

            this.stateMachine.triggerEvent('init-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('init-failed');
            throw new Error(e.toString());
        }
    }

    public registerWithInternetOfMe(
        email: string,
        anonymousEmail?: string,
    ): void {
        // wip
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
            // persist the credentials
            this.storage.setItem('name', name);
            this.storage.setItem('email', email);
            this.storage.setItem('deviceID', await createRandomString(64));
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
            await this.beforeLogout.emitAll();
            getDbInstance().close();
            closeInstance();
            this.stateMachine.triggerEvent('logout-succeeded');
        } catch (e) {
            this.stateMachine.triggerEvent('logout-failed');
            throw new Error(e);
        }
    }

    public erase(): void {
        // wip
    }

    public recover(): void {
        // wip
    }

    /**
     * Retrieves the credentials from the store.
     * @returns {{name: string, deviceID: string, email: string} | null}
     * @private
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
     * @returns {Promise<VersionedObjectResult<Module>[]>}
     * @private
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
