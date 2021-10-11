import {expect} from 'chai';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import type Authenticater from '../lib/models/Authenticator/Authenticator';
import {SingleUser} from '../lib/models/Authenticator';

describe('SingleUser Test', () => {

    async function waitForState(
        state: AuthState,
        delay: number = 500
    ): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            singleUserWorkflow.authState.onEnterState(newState => {
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
    const singleUserWorkflow = new SingleUser({directory: STORAGE_TEST_DIR});
    const secret = 'secret'

    async function eraseThroughWorkflow() {
        const loggedOutState = waitForState('logged_out');
        await singleUserWorkflow.erase();
        await loggedOutState;
    }

    describe('Register & Erase', () => {
        it('should test if register(secret) & erase() are successfully', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if erase() throws an error when it is called twice', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await loggedOutState;

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow.erase().then(res => {
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
        it('should test if register(secret) throws an error when user already exist', async () => {
            const loggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await loggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow.register(secret).then(async (_) => {
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
        it('should test if login(secret) & logout() are successfully', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.login(secret);
            await secondLoggedInState;

            const secondLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await secondLoggedOutState;
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            let hadError = false;

            const loggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await loggedInState;

            await singleUserWorkflow.logout();

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow.logout().then(async (_) => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'The transition does not exists from the current state with the specified event'
                    );
                    resolve();
                })
            })
        });
        it('should test if login(secret) throws an error when the user was not registered', async () => {
            try {
                await singleUserWorkflow.login(secret);
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include('Error while trying to login. User does not exists.');
            }
        });
        it('should test if login(secret) throws an error when the user double logins', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.login(secret);
            await secondLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow.login(secret).then(async (_) => {
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
        it('should test if login(secret) throws an error when the user inputs the wrong secret', async () => {
            let hadError = false;

            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.logout();
            await firstLoggedOutState;


            await new Promise<void>((resolve ,rejected) => {
                singleUserWorkflow.login('wrong-secret').then(async () => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'Error while trying to initialise instance due to Error: IC-AUTH'
                    );
                    resolve()
                })
            })
        })
    })
    describe('LoginOrRegister', () => {
        it('should test if loginOrregister(secret) is successfuly when no user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.loginOrRegister(secret);
            await firstLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrregister(secret) is successfuly when user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.loginOrRegister(secret);
            await secondLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrregister(secret) throws an error when the user double loginOrRegister', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.loginOrRegister(secret);
            await firstLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow.loginOrRegister(secret).then(async (_) => {
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
        it('should test if loginOrRegister(secret) throws an error when the user was' +
            ' already registered and it calls the function with the wrong secret', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await singleUserWorkflow.logout();
            await firstLoggedOutState;

            await new Promise<void>((resolve ,rejected) => {
                singleUserWorkflow.loginOrRegister('wrong-secret').then(async () => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    rejected('Call should have thrown error.')
                }).catch(async (error) => {
                    await singleUserWorkflow.login(secret);
                    await eraseThroughWorkflow();
                    expect(error, error).to.be.instanceof(Error);
                    expect(error.message).to.include(
                        'Error while trying to initialise instance due to Error: IC-AUTH'
                    );
                    resolve()
                })
            })
        })
    })
    describe('isRegistered', () => {
        it('should test if isRegistered() returns true when the user is registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await singleUserWorkflow.register(secret);
            await firstLoggedInState;

            expect(await singleUserWorkflow.isRegistered()).to.be.equal(true);

            const loggedOutState = waitForState('logged_out');
            await singleUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            expect(await singleUserWorkflow.isRegistered()).to.be.equal(false);
        });
    })
});
