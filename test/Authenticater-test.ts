import {expect} from 'chai';
import {SingleUserNoAuth} from '../lib/models/Authenticater';
import {SingleUser} from '../lib/models/Authenticater';
import type {AuthState} from '../lib/models/Authenticater/Authenticater';
import type Authenticater from '../lib/models/Authenticater/Authenticater';

async function waitForState(
    state: AuthState,
    workflow: Authenticater,
    delay: number = 250
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

// dont base test cases on previous test cases
// test case where multiple functions are tested in it - no need to create another test case
// provoke error - usual workflow - second test provoke errors.
describe('Authenticater test', () => {
    const STORAGE_TEST_DIR = 'test/testStorage';

    describe('SingleUserNoAuth Test', () => {
        const singleUserWorkflow = new SingleUserNoAuth({directory: STORAGE_TEST_DIR});

        it('should test if register() is successfully', async () => {
            const loggedInState = waitForState('logged_in', singleUserWorkflow);
            await singleUserWorkflow.register();
            await loggedInState;

            const loggedOutState = waitForState('logged_out', singleUserWorkflow);
            await singleUserWorkflow.erase();
            await loggedOutState;
        });
        it('should test if register() throws an error when user already exist', async () => {
            const loggedInState = waitForState('logged_in', singleUserWorkflow);
            await singleUserWorkflow.register();
            await loggedInState;

            try {
                await singleUserWorkflow.register();
            } catch (error) {
                expect(error, error).to.be.instanceof(Error);
                expect(error.message).to.include(
                    'Could not register user. The single user already exists.'
                );
            }
        });
        it('should test if login() is successfully', async () => {});
        it('should test logout', async () => {});
        it('should test loginOrRegister', async () => {});
    });

    describe('SingleUser Test', () => {
        const Workflow = new SingleUser({});

        after('f', async () => {
            await Workflow.erase();
        });

        it('should test register', () => {});
        it('should test login', () => {});
        it('should test logout', () => {});
        it('should test loginOrRegister', () => {});
        it('should test if user can be registered', () => {});
        it('should test if user can be registered', () => {});
    });
});
