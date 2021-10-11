import {expect} from 'chai';
import {SingleUserNoAuth} from '../lib/models/Authenticator';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import type Authenticater from '../lib/models/Authenticator/Authenticator';

describe('SingleUserNoAuth Test', () => {

    async function waitForState(
        state: AuthState,
        delay: number = 500
    ): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            singleUserNoAuthWorkflow.authState.onEnterState(newState => {
                if (newState === state) {
                    resolve();
                }
                setTimeout(() => {
                    rejected();
                }, delay);
            });
        });
    }

    const STORAGE_TEST_DIR = 'test/testStorage';
    const singleUserNoAuthWorkflow = new SingleUserNoAuth({directory: STORAGE_TEST_DIR});

    async function eraseThroughWorkflow() {
        const loggedOutState = waitForState('logged_out');
        await singleUserNoAuthWorkflow.erase();
        await loggedOutState;
    }

    describe('Register & Erase', () => {
        it('should test if register() & erase() are successfully', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await loggedOutState;
        });
        it('should test if erase() throws an error when it is called twice', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await loggedOutState;

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow.erase().then(res => {
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'The transition does not exists from the current state with the specified event'
                    );
                    resolve();
                })
            })
        });
        it('should test if register() throws an error when user already exist', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await loggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow.register().then(async (_) => {
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'Could not register user. The single user already exists.'
                    );
                    resolve();
                })
            })
        });
    });
    describe('Login & Logout', () => {
        it('should test if login() & logout() are successfully', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.login();
            await secondLoggedInState;

            const secondLoggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await secondLoggedOutState;
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            let hadError = false;

            const loggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await loggedInState;

            await singleUserNoAuthWorkflow.logout();

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow.logout().then(async (_) => {
                    await singleUserNoAuthWorkflow.login();
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await singleUserNoAuthWorkflow.login();
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'The transition does not exists from the current state with the specified event'
                    );
                    resolve();
                })
            })
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
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.login();
            await secondLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow.login().then(async (_) => {
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'The transition does not exists from the current state with the specified event'
                    );
                    resolve();
                })
            })
        });
    })
    describe('LoginOrRegister', () => {
        it('should test if loginOrRegister() is successfuly when no user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.loginOrRegister();
            await firstLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrRegister() is successfuly when user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.loginOrRegister();
            await secondLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrRegister() throws an error when the user double loginOrRegister', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.loginOrRegister();
            await firstLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow.loginOrRegister().then(async (_) => {
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'The transition does not exists from the current state with the specified event'
                    );
                    resolve();
                })
            })
        });
    })
    describe('isRegistered', () => {
        it('should test if isRegistered() returns true when the user is registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserNoAuthWorkflow.register();
            await firstLoggedInState;

            expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(true);

            const loggedOutState = waitForState('logged_out');
            await singleUserNoAuthWorkflow.erase();
            await loggedOutState;
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(false);
        });
    })
});
