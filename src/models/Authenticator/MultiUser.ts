import Authenticator from './Authenticator';
import {doesStorageExist} from '@refinio/one.core/lib/system/storage-base';
import {
    closeAndDeleteCurrentInstance,
    deleteInstance,
    initInstance,
    registerRecipes
} from '@refinio/one.core/lib/instance';

/**
 * This class represents an 'Multi User API With Credentials' authentication workflow.
 */
export default class MultiUser extends Authenticator {
    /**
     * Registers the user. Register acts as a login if the storage does not exists yet.
     * @param email
     * @param secret
     * @param instanceName
     */
    async register(email: string, secret: string, instanceName: string): Promise<void> {
        this.authState.triggerEvent('login');

        const storage = await doesStorageExist(instanceName, email, this.config.directory);

        if (storage) {
            this.authState.triggerEvent('login_failure');
            throw new Error('Could not register user. User already exists.');
        }

        try {
            await initInstance({
                name: instanceName,
                email: email,
                secret: secret,
                ownerName: email,
                directory: this.config.directory,
                initialRecipes: this.config.recipes,
                initiallyEnabledReverseMapTypes: this.config.reverseMaps
            });
        } catch (error) {
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to initialise instance due to ${error}`);
        }

        try {
            await this.importModules();
            await registerRecipes(this.config.recipes);
            await this.onLogin.emitAll(instanceName, secret, email);
            this.authState.triggerEvent('login_success');
        } catch (error) {
            await closeAndDeleteCurrentInstance();
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to configure instance due to ${error}`);
        }
    }

    /**
     * Logins the user. This function will:
     *  - trigger the 'login' event
     *  - will check if the storage exists
     *      - if yes, it will initialize the instance, import modules, register recipes,
     *        trigger onLogin and wait for all the listeners to finish and trigger
     *        'login_success' event
     *      - if no, it will trigger 'login_failure' event
     * @param email
     * @param secret
     * @param instanceName
     */
    async login(email: string, secret: string, instanceName: string): Promise<void> {
        this.authState.triggerEvent('login');

        const storage = await doesStorageExist(instanceName, email, this.config.directory);

        if (!storage) {
            this.authState.triggerEvent('login_failure');
            throw new Error('Error while trying to login. User does not exists.');
        }

        try {
            await initInstance({
                name: instanceName,
                email: email,
                secret: secret,
                ownerName: email,
                directory: this.config.directory,
                initialRecipes: this.config.recipes,
                initiallyEnabledReverseMapTypes: this.config.reverseMaps
            });
        } catch (error) {
            this.authState.triggerEvent('login_failure');

            if (error.code === 'IC-AUTH') {
                throw new Error('The provided secret is wrong');
            }
            throw new Error(`Error while trying to initialise instance due to ${error}`);
        }

        try {
            await this.importModules();
            await registerRecipes(this.config.recipes);
            await this.onLogin.emitAll(instanceName, secret, email);

            this.authState.triggerEvent('login_success');
        } catch (error) {
            this.authState.triggerEvent('login_failure');
            throw new Error(`Error while trying to configure instance due to ${error}`);
        }
    }

    /**
     * This function will login or register based on the storage existence.
     * @param email
     * @param secret
     * @param instanceName
     */
    async loginOrRegister(email: string, secret: string, instanceName: string): Promise<void> {
        const storage = await doesStorageExist(instanceName, email, this.config.directory);

        if (storage) {
            await this.login(email, secret, instanceName);
        } else {
            await this.register(email, secret, instanceName);
        }
    }

    /**
     * Checks if the user exists or not.
     * @param email
     * @param instanceName
     */
    async isRegistered(email: string, instanceName: string): Promise<boolean> {
        return await doesStorageExist(instanceName, email, this.config.directory);
    }

    /**
     * Erases the instance. This function will:
     *  - deletes the instance
     */
    async erase(
        instanceName: string,
        email: string,
        dbName: string | undefined = this.config.directory
    ): Promise<void> {
        await deleteInstance(instanceName, email, dbName);
    }

    /**
     * Logs out the current user and erases the instance.
     */
    async logoutAndErase(): Promise<void> {
        this.authState.triggerEvent('logout');

        // Signal the application that it should shutdown one dependent models
        // and wait for them to shut down
        await this.onLogout.emitAll();

        await closeAndDeleteCurrentInstance();
        this.authState.triggerEvent('logout_done');
    }
}
