import {expect} from 'chai';
import type {AuthState} from '../lib/models/Authenticator/Authenticator';
import {MultiUser} from '../lib/models/Authenticator';

describe('MultiUser Test', () => {
    async function waitForState(state: AuthState, delay: number = 500): Promise<void> {
        await new Promise<void>((resolve, rejected) => {
            multiUserWorkflow.authState.onEnterState(newState => {
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
    const multiUserWorkflow = new MultiUser({directory: STORAGE_TEST_DIR});
    const test$secret = 'secret';
    const test$email = 'email';
    const test$instanceName = 'iName';

    async function eraseThroughWorkflow() {
        const loggedOutState = waitForState('logged_out');
        await multiUserWorkflow.erase();
        await loggedOutState;
    }

    describe('Register & Erase', () => {
        it('should test if register(email, secret, instanceName) & erase() are successfully', async () => {
            const loggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if erase() throws an error when it is called twice', async () => {
            const loggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await loggedInState;

            const loggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await loggedOutState;

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .erase()
                    .then(res => {
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
            'should test if register(email, secret, instanceName) throws an error when user' +
                ' already exist',
            async () => {
                const loggedInState = waitForState('logged_in');
                await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
                await loggedInState;

                const firstLoggedOutState = waitForState('logged_out');
                await multiUserWorkflow.logout();
                await firstLoggedOutState;

                await new Promise<void>((resolve, rejected) => {
                    multiUserWorkflow
                        .register(test$email, test$secret, test$instanceName)
                        .then(async _ => {
                            await multiUserWorkflow.login(
                                test$email,
                                test$secret,
                                test$instanceName
                            );
                            await eraseThroughWorkflow();
                            rejected('Call should have thrown error.');
                        })
                        .catch(async error => {
                            await multiUserWorkflow.login(
                                test$email,
                                test$secret,
                                test$instanceName
                            );
                            await eraseThroughWorkflow();

                            // @todo it gets stucked in the include, for a very unknown reason
                            resolve();
                            expect(error, error).to.be.instanceof(Error);
                            expect(error.message).to.include(
                                'Could not register user. The single user already exists.'
                            );
                        });
                });
            }
        );
        it(
            'should test if register can create multiple users and erase each one of them' +
                ' successfully',
            async () => {
                const loggedInState = waitForState('logged_in');
                await multiUserWorkflow.register(
                    'test$email_1',
                    'test$secret_1',
                    'test$instanceName_1'
                );
                await loggedInState;

                const firstLoggedOutState = waitForState('logged_out');
                await multiUserWorkflow.erase();
                await firstLoggedOutState;

                const secondLoggedInState = waitForState('logged_in');
                await multiUserWorkflow.register(
                    'test$email_2',
                    'test$secret_2',
                    'test$instanceName_2'
                );
                await secondLoggedInState;

                const secondLoggedOutState = waitForState('logged_out');
                await multiUserWorkflow.erase();
                await secondLoggedOutState;

                const thirdLoggedInState = waitForState('logged_in');
                await multiUserWorkflow.register(
                    'test$email_3',
                    'test$secret_3',
                    'test$instanceName_3'
                );
                await thirdLoggedInState;

                const thirdLoggedOutState = waitForState('logged_out');
                await multiUserWorkflow.erase();
                await thirdLoggedOutState;
            }
        );
    });
    describe('Login & Logout', () => {
        it('should test if login(email, secret, instanceName) & logout() are successfully', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
            await secondLoggedInState;

            const secondLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await secondLoggedOutState;
        });
        it('should test if logout() throws an error when it is called twice', async () => {
            let hadError = false;

            const loggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await loggedInState;

            await multiUserWorkflow.logout();

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .logout()
                    .then(async _ => {
                        await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
                        await eraseThroughWorkflow();
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
                        await eraseThroughWorkflow();
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
                await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include(
                    'Error while trying to login. User does not exists.'
                );
            }
        });
        it('should test if login(email, secret, instanceName) throws an error when the user double logins', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
            await secondLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .login(test$email, test$secret, test$instanceName)
                    .then(async _ => {
                        await eraseThroughWorkflow();
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        await eraseThroughWorkflow();
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'The transition does not exists from the current state with the specified event'
                        );
                        resolve();
                    });
            });
        });
        it('should test if login(email, secret, instanceName) throws an error when the user inputs the wrong secret', async () => {
            let hadError = false;

            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await firstLoggedOutState;

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .login(test$email, 'wrong-secret', test$instanceName)
                    .then(async () => {
                        await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
                        await eraseThroughWorkflow();
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        await multiUserWorkflow.login(test$email, test$secret, test$instanceName);
                        await eraseThroughWorkflow();
                        expect(error, error).to.be.instanceof(Error);
                        expect(error.message).to.include(
                            'Error while trying to initialise instance due to Error: IC-AUTH'
                        );
                        resolve();
                    });
            });
        });
        it('should test if it can login into new created users', async () => {
            const loggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(
                'test$email_1',
                'test$secret_1',
                'test$instanceName_1'
            );
            await loggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(
                'test$email_2',
                'test$secret_2',
                'test$instanceName_2'
            );
            await secondLoggedInState;

            const secondLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await secondLoggedOutState;

            const thirdLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(
                'test$email_3',
                'test$secret_3',
                'test$instanceName_3'
            );
            await thirdLoggedInState;

            const thirdLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await thirdLoggedOutState;

            const firstUserLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.login('test$email_1', 'test$secret_1', 'test$instanceName_1');
            await firstUserLoggedInState;

            const firstUserLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await firstUserLoggedOutState;

            const secondUserLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.login('test$email_2', 'test$secret_2', 'test$instanceName_2');
            await secondUserLoggedInState;

            const secondUserLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await secondUserLoggedOutState;

            const thirdUserLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.login('test$email_3', 'test$secret_3', 'test$instanceName_3');
            await thirdUserLoggedInState;

            const thirdUserLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await thirdUserLoggedOutState;
        });
    });
    describe('LoginOrRegister', () => {
        it('should test if loginOrregister(email, secret, instanceName) is successfuly when no user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.loginOrRegister(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrregister(email, secret, instanceName) is successfuly when user was registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            const firstLoggedOutState = waitForState('logged_out');
            await multiUserWorkflow.logout();
            await firstLoggedOutState;

            const secondLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.loginOrRegister(test$email, test$secret, test$instanceName);
            await secondLoggedInState;

            const loggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if loginOrregister(email, secret, instanceName) throws an error when the user double loginOrRegister', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.loginOrRegister(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            await new Promise<void>((resolve, rejected) => {
                multiUserWorkflow
                    .loginOrRegister(test$email, test$secret, test$instanceName)
                    .then(async _ => {
                        await eraseThroughWorkflow();
                        rejected('Call should have thrown error.');
                    })
                    .catch(async error => {
                        await eraseThroughWorkflow();
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
                const firstLoggedInState = waitForState('logged_in');
                await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
                await firstLoggedInState;

                const firstLoggedOutState = waitForState('logged_out');
                await multiUserWorkflow.logout();
                await firstLoggedOutState;

                await new Promise<void>((resolve, rejected) => {
                    multiUserWorkflow
                        .loginOrRegister(test$email, 'wrong-secret', test$instanceName)
                        .then(async () => {
                            await multiUserWorkflow.login(
                                test$email,
                                test$secret,
                                test$instanceName
                            );
                            await eraseThroughWorkflow();
                            rejected('Call should have thrown error.');
                        })
                        .catch(async error => {
                            await multiUserWorkflow.login(
                                test$email,
                                test$secret,
                                test$instanceName
                            );
                            await eraseThroughWorkflow();
                            expect(error, error).to.be.instanceof(Error);
                            expect(error.message).to.include(
                                'Error while trying to initialise instance due to Error: IC-AUTH'
                            );
                            resolve();
                        });
                });
            }
        );
    });
    describe('isRegistered', () => {
        it('should test if isRegistered() returns true when the user is registered', async () => {
            const firstLoggedInState = waitForState('logged_in');
            await multiUserWorkflow.register(test$email, test$secret, test$instanceName);
            await firstLoggedInState;

            expect(await multiUserWorkflow.isRegistered(test$email, test$instanceName)).to.be.equal(
                true
            );

            const loggedOutState = waitForState('logged_out');
            await multiUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if isRegistered() returns false when the user is not registered', async () => {
            expect(await multiUserWorkflow.isRegistered(test$email, test$instanceName)).to.be.equal(
                false
            );
        });
    });
});
