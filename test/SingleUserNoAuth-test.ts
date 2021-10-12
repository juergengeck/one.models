import {expect} from 'chai';
import {SingleUserNoAuth} from '../lib/models/Authenticator';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';

describe('SingleUserNoAuth Test', () => {
    async function waitForState(state: AuthState, delay: number = 500): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            if(singleUserNoAuthWorkflow.authState.currentState === state){
                resolve();
            } else {
                singleUserNoAuthWorkflow.authState.onEnterState(newState => {
                    if (newState === state) {
                        resolve();
                    }
                    setTimeout(() => {
                        rejected();
                    }, delay);
                });
            }
        });
    }

    const STORAGE_TEST_DIR = 'test/testStorage';
    const singleUserNoAuthWorkflow = new SingleUserNoAuth({directory: STORAGE_TEST_DIR});

    afterEach((done) => {
        singleUserNoAuthWorkflow.login().then().catch().finally(async () => {
            singleUserNoAuthWorkflow.erase().then().catch().finally(() => {
                done();
            });
        })

    })

    beforeEach((done) => {
        singleUserNoAuthWorkflow.register().then(done).catch(err => {
            throw err;
        })
    })

    describe('Register & Erase', () => {
        it('should test if register() & erase() are successfully', async () => {
            await singleUserNoAuthWorkflow.erase();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.register();
            await waitForState('logged_in');
        });
        it('should test if erase() throws an error when it is called twice', async () => {
            await singleUserNoAuthWorkflow.erase();
            await waitForState('logged_out');

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow
                    .erase()
                    .then(res => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it('should test if register() throws an error when user already exist', async () => {
            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow
                    .register()
                    .then(_ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'Could not register user. The single user already exists.'
                        );
                        resolve();
                    });
            });
        });
    });
    describe('Login & Logout', () => {
        it('should test if login() & logout() are successfully', async () => {
            await singleUserNoAuthWorkflow.logout();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.login();
            await waitForState('logged_in');
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            await singleUserNoAuthWorkflow.logout();

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow
                    .logout()
                    .then(_ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it('should test if login() throws an error when the user was not registered', async () => {
            await singleUserNoAuthWorkflow.erase();
            await waitForState('logged_out')

            try {
                await singleUserNoAuthWorkflow.login();
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include(
                    'Error while trying to login. User does not exists.'
                );
            }
        });
        it('should test if login() throws an error when the user double logins', async () => {
            await singleUserNoAuthWorkflow.logout();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.login();
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow
                    .login()
                    .then(_ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
    });
    describe('LoginOrRegister', () => {
        it('should test if loginOrRegister() is successfuly when no user was registered', async () => {
            await singleUserNoAuthWorkflow.erase();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.loginOrRegister();
            await waitForState('logged_in');
        });
        it('should test if loginOrRegister() is successfuly when user was registered', async () => {
            await singleUserNoAuthWorkflow.logout();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.loginOrRegister();
            await waitForState('logged_in');
        });
        it('should test if loginOrRegister() throws an error when the user double loginOrRegister', async () => {
            await singleUserNoAuthWorkflow.logout();
            await waitForState('logged_out');

            await singleUserNoAuthWorkflow.loginOrRegister();
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                singleUserNoAuthWorkflow
                    .loginOrRegister()
                    .then(_ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
    });
    describe('isRegistered', () => {
        it('should test if isRegistered() returns true when the user is registered', async () => {
            expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(true);
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            await singleUserNoAuthWorkflow.erase();
            await waitForState('logged_out');

            expect(await singleUserNoAuthWorkflow.isRegistered()).to.be.equal(false);
        });
    });
});
