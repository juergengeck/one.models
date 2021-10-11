import {expect} from 'chai';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import type Authenticater from '../lib/models/Authenticator/Authenticator';
import {MultiUser} from '../src/models/Authenticator';

async function waitForState(
    state: AuthState,
    workflow: Authenticater,
    delay: number = 500
): Promise<void> {
    await new Promise<void>((resolve, rejected) => {
        workflow.authState.onEnterState(newState => {
            if (newState === state) {
                resolve();
            }
            setTimeout(() => {
                rejected();
            }, delay);
        });
    });
}

describe('MultiUser Test', () => {
    const STORAGE_TEST_DIR = 'test/testStorage';
    const secret = 'secret';
    const email = 'email';
    const instanceName = 'instanceName';
    const multiUserWorkflow = new MultiUser({directory: STORAGE_TEST_DIR});

    it('should test if register() & erase() are successfully', async () => {
        const loggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await loggedInState;

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;
    });
    it('should test if erase() throws an error when it is called twice', async () => {
        let hadError = false;
        const loggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await loggedInState;

        const secondLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await secondLoggedOutState;

        try {
            await multiUserWorkflow.erase();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        expect(hadError).to.be.equal(true);
    });
    it('should test if register() throws an error when user already exist', async () => {
        let hadError = false;
        const loggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await loggedInState;

        try {
            await multiUserWorkflow.register(email, secret, instanceName);
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'Could not register user. The single user already exists.'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if register() throws an error when no secret is provided', async () => {
        let hadError = false;

        try {
            // @ts-ignore
            await multiUserWorkflow.register();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'Could not register user. The provided secret is undefined.'
            );
            hadError = true;
        }

        expect(hadError).to.be.equal(true);
    });
    it('should test if login() & logout() are successfully', async () => {
        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.login(email, secret, instanceName);
        await secondLoggedInState;

        const secondLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await secondLoggedOutState;
    });
    it('should test if logout() throws an error when it is called twice', async () => {
        let hadError = false;

        const loggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await loggedInState;

        await multiUserWorkflow.logout();

        try {
            await multiUserWorkflow.logout();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        await multiUserWorkflow.login(email, secret, instanceName);

        const secondLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await secondLoggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if login() throws an error when the user was not registered', async () => {
        try {
            await multiUserWorkflow.login(email, secret, instanceName);
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include('Error while trying to login. User does not exists.');
        }
    });
    it('should test if login() throws an error when the user double logins', async () => {
        let hadError = false;

        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.login(email, secret, instanceName);
        await secondLoggedInState;

        try {
            await multiUserWorkflow.login(email, secret, instanceName);
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if loginOrRegister() is successfuly when no user was registered', async () => {
        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.loginOrRegister(email, secret, instanceName);
        await firstLoggedInState;

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;
    });
    it('should test if loginOrRegister() is successfuly when user was registered', async () => {
        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.loginOrRegister(email, secret, instanceName);
        await secondLoggedInState;

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;
    });
    it('should test if loginOrRegister() throws an error when the user double loginOrRegister', async () => {
        let hadError = false;

        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.loginOrRegister(email, secret, instanceName);
        await firstLoggedInState;

        try {
            await multiUserWorkflow.loginOrRegister(email, secret, instanceName);
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if isRegistered() returns true when the user is registered', async () => {
        const firstLoggedInState = waitForState('logged_in', multiUserWorkflow);
        await multiUserWorkflow.register(email, secret, instanceName);
        await firstLoggedInState;

        expect(await multiUserWorkflow.isRegistered(email, instanceName)).to.be.equal(true);

        const loggedOutState = waitForState('logged_out', multiUserWorkflow);
        await multiUserWorkflow.erase();
        await loggedOutState;
    });
    it('should test if isRegistered() returns false when the user is not registered', async () => {
        expect(await multiUserWorkflow.isRegistered(email, instanceName)).to.be.equal(false);
    });

    it('should test if the workflow can register & erase multiple users', async () => {})
    it('should test if the workflow can login multiple users', async () => {})
    it('should test if the login() throws an error if the secret is wrong for an user', async () => {})
});
