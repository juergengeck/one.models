import {expect} from 'chai';
import {SingleUserNoAuth} from '../lib/models/Authenticator';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import type Authenticater from '../lib/models/Authenticator/Authenticator';

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

describe('SingleUserNoAuth Test', () => {
    const STORAGE_TEST_DIR = 'test/testStorage';

    const singleUserNoAuthWorkflow = new SingleUserNoAuth({directory: STORAGE_TEST_DIR});

    it('should test if register() & erase() are successfully', async () => {
        const loggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await loggedInState;

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;
    });
    it('should test if erase() throws an error when it is called twice', async () => {
        let hadError = false;
        const loggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await loggedInState;

        const secondLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await secondLoggedOutState;

        try {
            await singleUserNoAuthWorkflow.erase();
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
        const loggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await loggedInState;

        try {
            await singleUserNoAuthWorkflow.register();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'Could not register user. The single user already exists.'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if login() & logout() are successfully', async () => {
        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.login();
        await secondLoggedInState;

        const secondLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await secondLoggedOutState;
    });
    it('should test if logout() throws an error when it is called twice', async () => {
        let hadError = false;

        const loggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await loggedInState;

        await singleUserNoAuthWorkflow.logout();

        try {
            await singleUserNoAuthWorkflow.logout();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        await singleUserNoAuthWorkflow.login();

        const secondLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await secondLoggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if login() throws an error when the user was not registered', async () => {
        try {
            await singleUserNoAuthWorkflow.login();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include('Error while trying to login. User does not exists.');
        }
    });
    it('should test if login() throws an error when the user double logins', async () => {
        let hadError = false;

        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.login();
        await secondLoggedInState;

        try {
            await singleUserNoAuthWorkflow.login();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if loginOrRegister() is successfuly when no user was registered', async () => {
        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.loginOrRegister();
        await firstLoggedInState;

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;
    });
    it('should test if loginOrRegister() is successfuly when user was registered', async () => {
        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await firstLoggedInState;

        const firstLoggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.logout();
        await firstLoggedOutState;

        const secondLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.loginOrRegister();
        await secondLoggedInState;

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;
    });
    it('should test if loginOrRegister() throws an error when the user double loginOrRegister', async () => {
        let hadError = false;

        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.loginOrRegister();
        await firstLoggedInState;

        try {
            await singleUserNoAuthWorkflow.loginOrRegister();
        } catch (error) {
            expect(error, error).to.be.instanceof(Error);
            expect(error.message).to.include(
                'The transition does not exists from the current state with the specified event'
            );
            hadError = true;
        }

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;

        expect(hadError).to.be.equal(true);
    });
    it('should test if isRegistered() returns true when the user is registered', async () => {
        const firstLoggedInState = waitForState('logged_in', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.register();
        await firstLoggedInState;

        expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(true);

        const loggedOutState = waitForState('logged_out', singleUserNoAuthWorkflow);
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;
    });
    it('should test if isRegistered() returns false when the user is not registered', async () => {
        expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(false);
    });
});
