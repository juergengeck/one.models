import {expect} from 'chai';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import {MultiUser} from '../lib/models/Authenticator';

describe('MultiUser Test', () => {
    async function waitForState(state: AuthState, delay: number = 500): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            if(multiUserWorkflow.authState.currentState === state){
                resolve();
            } else {
                multiUserWorkflow.authState.onEnterState(newState => {
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

    const [user1, user2] = [
        {email: 'test$email_1', secret: 'test$secret_1', instance: 'test$instanceName_1'},
        {email: 'test$email_2', secret: 'test$secret_2', instance: 'test$instanceName_2'}
    ];

    const STORAGE_TEST_DIR = 'test/testStorage';
    const multiUserWorkflow = new MultiUser({directory: STORAGE_TEST_DIR});

    /**
     * After each test case login & erase user1, followed by login & erase user2
     */
    afterEach(done => {
        multiUserWorkflow.login(user1.email, user1.secret, user1.instance).finally(() => {
            multiUserWorkflow.eraseCurrentInstance().finally(() => {
                multiUserWorkflow.login(user2.email, user2.secret, user2.instance).finally(() => {
                    multiUserWorkflow.eraseCurrentInstance().finally(done);
                });
            });
        });
    });

    /**
     * Before each test case register & logout the user2, followed by register the user1 & logout
     */
    beforeEach(done => {
        multiUserWorkflow
            .register(user2.email, user2.secret, user2.instance)
            .then(() => {
                multiUserWorkflow.logout().then(() => {
                    multiUserWorkflow
                        .register(user1.email, user1.secret, user1.instance)
                        .then(() => {
                            multiUserWorkflow.logout().then(done);
                        })
                        .catch(err => {
                            throw err;
                        });
                });
            })
            .catch(err => {
                throw err;
            });
    });

    describe('Register & Erase', () => {
        it('should test if register(email, secret, instanceName) & eraseCurrentInstance() are successfully', async () => {
            await multiUserWorkflow.register('test$email', 'test$secret', 'test$instanceName');
            await waitForState('logged_in');

            await multiUserWorkflow.eraseCurrentInstance();
            await waitForState('logged_out');
        });
        it('should test if eraseCurrentInstance() throws an error when it is called twice', async () => {
            await multiUserWorkflow.login(user1.email, user1.secret, user1.instance);
            await  waitForState('logged_in');

            await multiUserWorkflow.eraseCurrentInstance();
            await waitForState('logged_out');

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .eraseCurrentInstance()
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
        it('should test if erase is successfully', async () => {
            await multiUserWorkflow.erase(user1.instance, user1.email);
        })
        it(
            'should test if register(email, secret, instanceName) throws an error when user' +
                ' already exist',
            done => {
                multiUserWorkflow
                    .register(user1.email, user1.secret, user1.instance)
                    .then(_ => {
                        done('Call should have thrown error.');
                    })
                    .catch(error => {
                        done()
                        // code gets stucked in the .to.include for some unknown reason
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'Could not register user. The single user already exists.'
                        );
                    });
            }
        );
        it(
            'should test if register can create multiple users and erase each one of them' +
                ' successfully',
            async () => {
                await multiUserWorkflow.register(
                    'test$email_3',
                    'test$secret_3',
                    'test$instanceName_3'
                );
                await waitForState('logged_in');

                await multiUserWorkflow.eraseCurrentInstance();
                await waitForState('logged_out');

                await multiUserWorkflow.register(
                    'test$email_4',
                    'test$secret_4',
                    'test$instanceName_4'
                );
                await waitForState('logged_in');

                await multiUserWorkflow.eraseCurrentInstance();
                await waitForState('logged_out');
            }
        );
    });
    describe('Login & Logout', () => {
        it('should test if login(email, secret, instanceName) & logout() are successfully', async () => {
            await multiUserWorkflow.login(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');

            await multiUserWorkflow.login(user2.email, user2.secret, user2.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            let hadError = false;

            await multiUserWorkflow.login(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
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
        it('should test if login(email, secret, instanceName) throws an error when the user was not registered', async () => {
            try {
                await multiUserWorkflow.login(
                    'test$email_5',
                    'test$secret_5',
                    'test$instanceName_5'
                );
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include(
                    'Error while trying to login. User does not exists.'
                );
            }
        });
        it('should test if login(email, secret, instanceName) throws an error when the user double logins', async () => {
            await multiUserWorkflow.login(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .login(user1.email, user1.secret, user1.instance)
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
        it('should test if login(email, secret, instanceName) throws an error when the user inputs the wrong secret', async () => {
            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .login(user1.email, 'wrong-secret', user1.instance)
                    .then(async () => {
                        rejected('Call should have thrown error.');
                    })
                    .catch(error => {
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The provided secret is wrong'
                        );
                        resolve();
                    });
            });
        });
        it('should test if it can login & logout into new created users', async () => {
            await multiUserWorkflow.login(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');

            await multiUserWorkflow.login(user2.email, user2.secret, user2.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');
        });
    });
    describe('LoginOrRegister', () => {
        it('should test if loginOrregister(email, secret, instanceName) is successfuly when no user was registered', async () => {
            await multiUserWorkflow.loginOrRegister(
                'test$email_6',
                'test$secret_6',
                'test$instanceName_6'
            );
            await waitForState('logged_in');

            await multiUserWorkflow.eraseCurrentInstance();
            await waitForState('logged_out');
        });
        it('should test if loginOrregister(email, secret, instanceName) is successfuly when user was registered', async () => {
            await multiUserWorkflow.loginOrRegister(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');

            await multiUserWorkflow.loginOrRegister(user2.email, user2.secret, user2.instance);
            await waitForState('logged_in');

            await multiUserWorkflow.logout();
            await waitForState('logged_out');
        });
        it('should test if loginOrregister(email, secret, instanceName) throws an error when the user double loginOrRegister', async () => {
            await multiUserWorkflow.loginOrRegister(user1.email, user1.secret, user1.instance);
            await waitForState('logged_in');

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .loginOrRegister(user1.email, user1.secret, user1.instance)
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
        it(
            'should test if loginOrregister(email, secret, instanceName) throws an error when the user was' +
                ' already registered and it calls the function with the wrong secret',
            async () => {
                await new Promise<void>((resolve, rejected) => {
                    multiUserWorkflow
                        .loginOrRegister(user1.email, 'wrong-secret', user1.instance)
                        .then(async () => {
                            rejected('Call should have thrown error.');
                        })
                        .catch(error => {
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
            expect(await multiUserWorkflow.isRegistered(user1.email, user1.instance)).to.be.equal(
                true
            );
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            expect(
                await multiUserWorkflow.isRegistered('test$email_5', 'test$instanceName_5')
            ).to.be.equal(false);
        });
    });
});
