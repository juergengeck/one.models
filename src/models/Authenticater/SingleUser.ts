import {Authenticater} from './Authenticater';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {doesStorageExist} from 'one.core/lib/system/storage-base';
import {initInstance} from 'one.core/lib/instance';
import {stringify} from 'one.core/lib/util/sorted-stringify';

type Credentials = {
    email: string;
    name: string;
};

export default class SingleUser extends Authenticater {
    private static readonly CREDENTIAL_CONTAINER_KEY_STORE = 'credentials';

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
        }
    }

    async loginOrRegister(secret: string): Promise<void> {
        const credentials = this.retrieveCredentialsFromStore();

        if (credentials === null) {
            await this.register(secret);
        } else {
            await this.login(secret);
        }
    }

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
