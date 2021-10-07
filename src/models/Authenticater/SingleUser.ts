import Authenticater from './Authenticater';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {doesStorageExist} from 'one.core/lib/system/storage-base';
import {initInstance, registerRecipes} from 'one.core/lib/instance';
import {stringify} from 'one.core/lib/util/sorted-stringify';

type Credentials = {
    email: string;
    name: string;
};

/**
 * This class represents an 'Single User API With Credentials' authentication workflow.
 */
export default class SingleUser extends Authenticater {
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
     *      - if yes, it will check if the storage exist
     *          - if yes, it will throw error
     *          - if no, it will login the user
     * @param secret
     */
    async register(secret: string): Promise<void> {
        const credentials = this.retrieveCredentialsFromStore();

        if (credentials === null) {
            this.persistCredentialsToStore({
                email: await createRandomString(64),
                name: await createRandomString(64)
            });
        } else {
            const {email, name} = credentials;
            const storage = await doesStorageExist(name, email);

            if (storage) {
                throw new Error('Could not register user. The single user already exists.');
            }
        }
        await this.login(secret);
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
            const storage = await doesStorageExist(name, email);

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
                    directory: super.config.directory,
                    initialRecipes: super.config.recipes,
                    initiallyEnabledReverseMapTypes: super.config.reverseMaps
                });
                await super.importModules();
                await registerRecipes(this.config.recipes);
                await super.onLogin.emitAll();

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
        const credentials = this.retrieveCredentialsFromStore();

        if (credentials === null) {
            await this.register(secret);
        } else {
            await this.login(secret);
        }
    }

    /**
     * Checks if the user exists or not by checking the credentials in the store.
     */
    async isRegistered(): Promise<boolean> {
        const credentials = this.retrieveCredentialsFromStore();

        return credentials === null;
    }

    private retrieveCredentialsFromStore(): Credentials | null {
        const storeCredentials = super.store.getItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE);

        if (storeCredentials === null) {
            return null;
        }

        return JSON.parse(storeCredentials);
    }

    private persistCredentialsToStore(credentials: Credentials): void {
        super.store.setItem(SingleUser.CREDENTIAL_CONTAINER_KEY_STORE, stringify(credentials));
    }
}
