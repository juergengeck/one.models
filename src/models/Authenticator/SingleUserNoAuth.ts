import Authenticator from './Authenticator';
import {closeAndDeleteCurrentInstance, initInstance, registerRecipes} from 'one.core/lib/instance';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {doesStorageExist} from 'one.core/lib/system/storage-base';

type Credentials = {
    email: string;
    name: string;
    secret: string;
};

/**
 * This class represents an 'Single User API without Credentials' authentication workflow.
 */
export default class SingleUserNoAuth extends Authenticator {
    /**
     * The store key to the credentials container for SingleUserNoAuth
     * @private
     */
    private static readonly CREDENTIAL_CONTAINER_KEY_STORE = 'credentials-single-user-no-auth';

    /**
     * Registers the user with generated credentials.
     * This function will:
     *  - will check if there are any stored credentials
     *      - if no, it will persist the generated email, instance name & secret
     *      - if yes, continue
     *  - will trigger the 'login' event
     *  - will init the instance
     *  - if successful
     *      - if yes, it will trigger the 'login_success' event
     *      - if no, it will throw error and trigger 'login_failure' event
     */
    async register(): Promise<void> {
        const {name, email, secret} = await this.generateCredentialsIfNotExist();

        const storage = await doesStorageExist(name, email, this.config.directory);

        if (storage) {
            throw new Error('Could not register user. The single user already exists.');
        }

        this.authState.triggerEvent('login');

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
            await this.importModules();
            await registerRecipes(this.config.recipes);
            await this.onLogin.emitAll(name, secret, email);
            this.authState.triggerEvent('login_success');
        } catch (error) {
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to initialise instance due to ${error}`);
        }
    }

    /**
     * Logins the user. This function will:
     *  - trigger the 'login' event
     *  - will check if there are any stored credentials
     *      - if no, it will throw an error and trigger 'login_failure' event
     *      - if yes, it will check if the storage exist
     *          - if no, it will throw an error and trigger 'login_failure' event
     *          - if yes, it will initialize the instance, import modules, register recipes
     *            trigger onLogin and wait for all the listeners to finish and trigger
     *            'login_success' event
     */
    async login(): Promise<void> {
        this.authState.triggerEvent('login');

        const credentials = await this.retrieveCredentialsFromStore();

        if (credentials === undefined) {
            this.authState.triggerEvent('login_failure');
            throw new Error('Error while trying to login. User does not exists.');
        } else {
            const {email, name, secret} = credentials;
            const storage = await doesStorageExist(name, email, this.config.directory);

            if (!storage) {
                this.authState.triggerEvent('login_failure');
                throw new Error('Error while trying to login. User storage does not exists.');
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
     */
    async loginOrRegister(): Promise<void> {
        const credentials = await this.retrieveCredentialsFromStore();

        if (credentials === undefined) {
            await this.register();
        } else {
            await this.login();
        }
    }

    /**
     * Checks if the user exists or not by checking the credentials in the store.
     */
    async isRegistered(): Promise<boolean> {
        const credentials = await this.retrieveCredentialsFromStore();
        return credentials !== undefined;
    }

    /**
     * Erases the current instance's database. This function will:
     *  - triggers 'logout' event
     *  - triggers onLogout event
     *  - deletes the database
     *  - removes (if present) only workflow related store
     *  - triggers 'logout_done' event
     */
    async erase(): Promise<void> {
        this.authState.triggerEvent('logout');

        // Signal the application that it should shutdown one dependent models
        // and wait for them to shut down
        await this.onLogout.emitAll();

        await closeAndDeleteCurrentInstance();
        await this.store.removeItem(SingleUserNoAuth.CREDENTIAL_CONTAINER_KEY_STORE);
        this.authState.triggerEvent('logout_done');
    }

    private async retrieveCredentialsFromStore(): Promise<Credentials | undefined> {
        const storeCredentials = await this.store.getItem(
            SingleUserNoAuth.CREDENTIAL_CONTAINER_KEY_STORE
        );
        if (storeCredentials === undefined) {
            return undefined;
        }

        // Type cast: storing and retrieving is local to this module and we use the same key
        return storeCredentials as Credentials;
    }

    private async persistCredentialsToStore(credentials: Credentials): Promise<void> {
        await this.store.setItem(SingleUserNoAuth.CREDENTIAL_CONTAINER_KEY_STORE, credentials);
    }

    private async generateCredentialsIfNotExist(): Promise<Credentials> {
        const credentialsFromStore = await this.retrieveCredentialsFromStore();
        if (credentialsFromStore === undefined) {
            const generatedCredentials = {
                email: await createRandomString(64),
                name: await createRandomString(64),
                secret: await createRandomString(64)
            };
            await this.persistCredentialsToStore(generatedCredentials);
            return generatedCredentials;
        }
        return credentialsFromStore;
    }
}
