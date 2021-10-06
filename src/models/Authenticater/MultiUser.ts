import {Authenticater} from './Authenticater';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {doesStorageExist} from 'one.core/lib/system/storage-base';
import {initInstance} from 'one.core/lib/instance';

export default class MultiUser extends Authenticater {
    async register(email: string, secret: string, instanceName: string): Promise<void> {
        const storage = await doesStorageExist(instanceName, email);

        if (storage) {
            throw new Error('Could not register user. User already exists.');
        }

        await this.login(email, secret, instanceName);
    }

    async login(email: string, secret: string, instanceName: string): Promise<void> {
        this.authState.triggerEvent('login');

        const storage = await doesStorageExist(instanceName, email);

        if (storage) {
            try {
                await initInstance({
                    name: instanceName,
                    email: email,
                    secret: secret,
                    ownerName: 'name' + email
                });
                // await super.importModules();
                // await registerRecipes(this.config.recipes);
                await super.onLogin.emitAll();

                this.authState.triggerEvent('login_success');
            } catch (error) {
                this.authState.triggerEvent('login_failure');
                throw new Error(`Error while trying to initialise instance due to ${error}`);
            }
        } else {
            this.authState.triggerEvent('login_failure');
            throw new Error('Error while trying to login. User does not exists.');
        }
    }

    async loginOrRegister(email: string, secret: string, instanceName: string): Promise<void> {
        const storage = await doesStorageExist(instanceName, email);

        if (storage) {
            await this.login(email, secret, instanceName);
        } else {
            await this.register(email, secret, instanceName);
        }
    }

    async isRegistered(email: string, instanceName: string): Promise<boolean> {
        return await doesStorageExist(instanceName, email);
    }
}
