import {expect} from 'chai';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import {SingleUser} from '../lib/models/Authenticator';

describe('SingleUser Test', () => {
    async function waitForState(state: AuthState, delay: number = 500): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            if(singleUserWorkflow.authState.currentState === state){
                resolve();
            } else {
                singleUserWorkflow.authState.onEnterState(newState => {
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
    const singleUserWorkflow = new SingleUser({directory: STORAGE_TEST_DIR});
    const secret = 'secret';


    afterEach((done) => {
        singleUserWorkflow.login(secret).then().catch().finally(async () => {
            singleUserWorkflow.erase().then().catch().finally(() => {
                done();
            });
        })

    })

    beforeEach((done) => {
        singleUserWorkflow.register(secret).then(done).catch(err => {
            throw err;
        })
    })


    describe('Register & Erase', () => {
        it('should test if register(secret) & erase() are successfully', async () => {
            await singleUserWorkflow.erase();
            await waitForState('logged_out');

            await singleUserWorkflow.register(secret);
            await waitForState('logged_in');

            await singleUserWorkflow.erase();
            await waitForState('logged_out');
        });
        it('should test if erase() throws an error when it is called twice', async () => {
            await singleUserWorkflow.erase();
            await waitForState('logged_out');

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .erase()
                    .then(res => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'Could not erase due to lack of credentials without loging in. The credentials does not exist. Try to login and delete.'
                        );
                        resolve();
                    });
            });
        });
        it('should test if register(secret) throws an error when user already exist', async () => {
            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .register(secret)
                    .then(async _ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
    });
    describe('Login & Logout', () => {
        it('should test if login(secret) & logout() are successfully', async () => {
            await singleUserWorkflow.logout();
            await waitForState('logged_out');

            await singleUserWorkflow.login(secret);
            await waitForState('logged_in');
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            await singleUserWorkflow.logout();

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .logout()
                    .then(async _ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it('should test if login(secret) throws an error when the user was not registered', async () => {
            await singleUserWorkflow.erase();
            await waitForState('logged_out');

            try {
                await singleUserWorkflow.login(secret);
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include(
                    'Error while trying to login. User does not exists.'
                );
            }
        });
        it('should test if login(secret) throws an error when the user double logins', async () => {
            await singleUserWorkflow.logout();
            await waitForState('logged_out');

            await singleUserWorkflow.login(secret);
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .login(secret)
                    .then(async _ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it('should test if login(secret) throws an error when the user inputs the wrong secret', async () => {
            await singleUserWorkflow.logout();
            await waitForState('logged_out');

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .login('wrong-secret')
                    .then(async () => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The provided secret is wrong'
                        );
                        resolve();
                    });
            });
        });
    });
    describe('LoginOrRegister', () => {
        it('should test if loginOrregister(secret) is successfuly when no user was registered', async () => {
            await singleUserWorkflow.erase();
            await waitForState('logged_out');

            await singleUserWorkflow.loginOrRegister(secret);
            await waitForState('logged_in');
        });
        it('should test if loginOrregister(secret) is successfuly when user was registered', async () => {
            await singleUserWorkflow.logout();
            await waitForState('logged_out');

            await singleUserWorkflow.loginOrRegister(secret);
            await waitForState('logged_in');
        });
        it('should test if loginOrregister(secret) throws an error when the user double loginOrRegister', async () => {
            await singleUserWorkflow.logout();
            await waitForState('logged_out');

            await singleUserWorkflow.loginOrRegister(secret);
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                singleUserWorkflow
                    .loginOrRegister(secret)
                    .then(async _ => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it(
            'should test if loginOrRegister(secret) throws an error when the user was' +
                ' already registered and it calls the function with the wrong secret',
            async () => {
                await singleUserWorkflow.logout();
                await waitForState('logged_out');

                await new Promise<void>((resolve, rejected) => {
                    singleUserWorkflow
                        .loginOrRegister('wrong-secret')
                        .then(async () => {
                            rejected('Call should have thrown error.');
                        })
                        .catch(async error => {
                            expect(error, error).to.be.instanceof(Error);
                            expect(error.message).to.include(
                                'The provided secret is wrong'
                            );
                            resolve();
                        });
                });
            }
        );
    });
    describe('isRegistered', () => {
        it('should test if isRegistered() returns true when the user is registered', async () => {
            expect(await singleUserWorkflow.isRegistered()).to.be.equal(true);
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            await singleUserWorkflow.erase();
            await waitForState('logged_out');

            expect(await singleUserWorkflow.isRegistered()).to.be.equal(false);
        });
    });
});
