import Authenticator from './Authenticator';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {doesStorageExist} from 'one.core/lib/system/storage-base';
import {
    closeAndDeleteCurrentInstance,
    deleteInstance,
    initInstance,
    registerRecipes
} from 'one.core/lib/instance';
import {stringify} from 'one.core/lib/util/sorted-stringify';

type Credentials = {
    email: string;
    name: string;
};

/**
 * This class represents an 'Single User API With Credentials' authentication workflow.
 */
export default class SingleUser extends Authenticator {
    /**
     * The store key to the credentials container for SingleUser
     * @private
     */
    private static readonly CREDENTIAL_CONTAINER_KEY_STORE = 'credentials-single-user';

    /**
     * Registers the user with secret and generated instance name & email.
     * This function will:
     *  - will check if there are any stored credentials
     *      - if no, it will persist the generated instance name & email
     *      - if yes, continue
     *  - will trigger the 'login' event
     *  - will init the instance
     *  - if successful
     *      - if yes, it will trigger the 'login_success' event
     *      - if no, it will throw error and trigger 'login_failure' event
     * @param secret
     */
    async register(secret: string): Promise<void> {
        this.authState.triggerEvent('login');

        const {name, email} = await this.generateCredentialsIfNotExist();

        const storage = await doesStorageExist(name, email, this.config.directory);

        if (storage) {
            this.authState.triggerEvent('login_failure');
            throw new Error('Could not register user. The single user already exists.');
        }

        try {
            await initInstance({
                name: name,
                email: email,
                secret: secret === undefined ? null : secret,
                ownerName: 'name' + email,
                directory: this.config.directory,
                initialRecipes: this.config.recipes,
                initiallyEnabledReverseMapTypes: this.config.reverseMaps
            });
        } catch (error) {
            this.store.removeItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to initialise instance due to ${error}`);
        }

        try {
            await this.importModules();
            await registerRecipes(this.config.recipes);
            await this.onLogin.emitAll(name, secret, email);
            this.authState.triggerEvent('login_success');
        } catch (error) {
            await closeAndDeleteCurrentInstance();
            this.store.removeItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to configure instance due to ${error}`);
        }
    }

    /**
     * Logins the user. This function will:
     *  - trigger the 'login' event
     *  - will check if there are any stored credentials
     *      - if no, it will throw an error and trigger 'login_failure' event
     *      - if yes, it will check if the storage exist
     *          - if yes, it will initialize the instance, import modules, register recipes
     *            trigger onLogin and wait for all the listeners to finish and trigger
     *            'login_success' event
     *          - if no, it will throw an error and trigger 'login_failure' event
     * @param secret
     */
    async login(secret: string): Promise<void> {
        this.authState.triggerEvent('login');

        const credentials = this.retrieveCredentialsFromStore();

        if (credentials === null) {
            this.authState.triggerEvent('login_failure');
            throw new Error('Error while trying to login. User does not exists.');
        } else {
            const {email, name} = credentials;
            const storage = await doesStorageExist(name, email, this.config.directory);

            if (!storage) {
                this.authState.triggerEvent('login_failure');
                throw new Error('Error while trying to login. User storage does not exists.');
            }

            try {
                await initInstance({
                    name: name,
                    email: email,
                    secret: secret,
                    ownerName: 'name' + email,
                    directory: this.config.directory,
                    initialRecipes: this.config.recipes,
                    initiallyEnabledReverseMapTypes: this.config.reverseMaps
                });
            } catch (error) {
                if (error.code === 'IC-AUTH') {
                    this.authState.triggerEvent('login_failure');
                    throw new Error('The provided secret is wrong');
                }
                this.authState.triggerEvent('login_failure');
                throw new Error(`Error while trying to initialise instance due to ${error}`);
            }

            try {
                await this.importModules();
                await registerRecipes(this.config.recipes);
                await this.onLogin.emitAll(name, secret, email);

                this.authState.triggerEvent('login_success');
            } catch (error) {
                this.authState.triggerEvent('login_failure');
                throw new Error(`Error while trying to initialise instance due to ${error}`);
            }
        }
    }

    /**
     * This function will login or register based on the credentials existence in store.
     * @param secret
     */
    async loginOrRegister(secret: string): Promise<void> {
        const isRegistered = await this.isRegistered();

        if (isRegistered) {
            await this.login(secret);
        } else {
            await this.register(secret);
        }
    }

    /**
     * Checks if the user exists or not by checking the credentials in the store.
     */
    async isRegistered(): Promise<boolean> {
        // check if there are any saved credentials
        const credentials = this.retrieveCredentialsFromStore();

        if (credentials === null) {
            return false;
        }
        const {name, email} = credentials;

        // check if the one storage exist (the instance was created)
        return await doesStorageExist(name, email, this.config.directory);
    }

    /**
     * Erases the current instance's database. This function will:
     *  - triggers 'logout' event
     *  - triggers onLogout event
     *  - deletes the database
     *  - removes (if present) only workflow related store
     *  - trigger 'logout_done' event
     */
    async erase(): Promise<void> {
        if (this.authState.currentState === 'logged_in') {
            this.authState.triggerEvent('logout');

            // Signal the application that it should shutdown one dependent models
            // and wait for them to shut down
            await this.onLogout.emitAll();

            await closeAndDeleteCurrentInstance();
            this.store.removeItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);
            this.authState.triggerEvent('logout_done');
            return;
        }

        if (this.authState.currentState === 'logged_out') {
            this.store.removeItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);
            const credentials = this.retrieveCredentialsFromStore();
            if (credentials !== null) {
                const {name, email} = credentials;
                await deleteInstance(name, email, this.config.directory);
            } else {
                throw new Error(
                    'Could not erase due to lack of credentials without loging in.' +
                        ' The credentials does not exist. Try to login and delete.'
                );
            }
        }
    }

    private retrieveCredentialsFromStore(): Credentials | null {
        const storeCredentials = this.store.getItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);

        if (storeCredentials === null) {
            return null;
        }

        return JSON.parse(storeCredentials);
    }

    private persistCredentialsToStore(credentials: Credentials): void {
        this.store.setItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE, stringify(credentials));
    }

    private async generateCredentialsIfNotExist(): Promise<Credentials> {
        const credentialsFromStore = this.retrieveCredentialsFromStore();
        if (credentialsFromStore === null) {
            const generatedCredentials = {
                email: await createRandomString(64),
                name: await createRandomString(64)
            };
            this.persistCredentialsToStore(generatedCredentials);
            return generatedCredentials;
        }
        return credentialsFromStore;
    }
}
