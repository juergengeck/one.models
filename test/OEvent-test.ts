import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import {expect} from 'chai';
import * as StorageTestInit from 'one.core/test/_helpers';
import {EventTypes, createEvent} from '../lib/misc/OEvent';
let testModel: TestModel;

/**
 * Promise wrapped timeout.
 * @param milis
 */
function promiseTimeout(milis: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), milis);
    });
}

describe('Simple event test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
    });

    it('emit sync - check listener handle is called synchronously ', async () => {
        const onEvent = createEvent<(stringVal: string, numberVal: number) => void>(
            EventTypes.Default,
            false
        );

        let handlerCalled1 = false;
        let handlerCalled2 = false;
        let stringVal = null;
        let numberVal = null;

        const disconnect1 = onEvent((emittedStringVal: string, emittedNumberVal: number) => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled1 = true;
                    stringVal = emittedStringVal;
                    numberVal = emittedNumberVal;
                    resolve();
                }, 1 * 100);
            });
        });
        const disconnect2 = onEvent((emittedStringVal: string, emittedNumberVal: number) => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled2 = true;
                    stringVal = emittedStringVal;
                    numberVal = emittedNumberVal;
                    resolve();
                }, 2 * 100);
            });
        });
        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(stringVal).to.be.equal(null);
        expect(numberVal).to.be.equal(null);

        onEvent.emit('EMIT AND FORGET STRING', 123);

        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(stringVal).to.be.equal(null);
        expect(numberVal).to.be.equal(null);
        await promiseTimeout(2 * 100);

        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(false);

        await promiseTimeout(2 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);

        expect(stringVal).to.be.equal('EMIT AND FORGET STRING');
        expect(numberVal).to.be.equal(123);

        disconnect1();
        disconnect2();
    }).timeout(1000);

    it('emit async - check listener handle is called asynchronously ', async () => {
        const onEvent = createEvent<(arg1: string, arg2: number) => void>(EventTypes.Default, true);

        let handlerCalled1 = false;
        let handlerCalled2 = false;
        let stringVal = null;
        let numberVal = null;

        const disconnect1 = onEvent((emitStringValue: string, emitNumberValue: number) => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled1 = true;
                    stringVal = emitStringValue;
                    numberVal = emitNumberValue;
                    resolve();
                }, 1 * 100);
            });
        });
        const disconnect2 = onEvent((emitStringValue: string, emitNumberValue: number) => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled2 = true;
                    stringVal = emitStringValue;
                    numberVal = emitNumberValue;
                    resolve();
                }, 1 * 100);
            });
        });
        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(stringVal).to.be.equal(null);
        expect(numberVal).to.be.equal(null);

        onEvent.emit('EMIT AND FORGET STRING', 123);

        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(stringVal).to.be.equal(null);
        expect(numberVal).to.be.equal(null);

        await promiseTimeout(1 * 150);

        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);
        expect(stringVal).to.be.equal('EMIT AND FORGET STRING');
        expect(numberVal).to.be.equal(123);

        disconnect1();
        disconnect2();
    }).timeout(1000);

    it('emitAll sync - promise settles when all handlers executed synchronously ', async () => {
        const onEvent = createEvent<() => void>(EventTypes.Default, false);

        let handlerCalled1 = false;
        let handlerCalled2 = false;
        let handlerCalled3 = false;

        let promiseSettled = false;

        const disconnect1 = onEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled1 = true;
                    resolve();
                }, 2 * 100);
            });
        });
        const disconnect2 = onEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled2 = true;
                    resolve();
                }, 2 * 100);
            });
        });
        const disconnect3 = onEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled3 = true;
                    resolve();
                }, 3 * 100);
            });
        });
        onEvent.emitAll().then(() => {
            promiseSettled = true;
        });
        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(handlerCalled3).to.be.equal(false);
        expect(promiseSettled).to.be.equal(false);

        await promiseTimeout(3 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(false);
        expect(handlerCalled3).to.be.equal(false);
        expect(promiseSettled).to.be.equal(false);

        await promiseTimeout(2 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);
        expect(handlerCalled3).to.be.equal(false);
        expect(promiseSettled).to.be.equal(false);

        await promiseTimeout(3 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);
        expect(handlerCalled3).to.be.equal(true);
        expect(promiseSettled).to.be.equal(true);

        disconnect1();
        disconnect2();
        disconnect3();
    }).timeout(1000);

    it('emitAll async - promise settles when all handlers executed asynchronously ', async () => {
        const onStringEvent = createEvent<() => void>(EventTypes.Default, true);

        let handlerCalled1 = false;
        let handlerCalled2 = false;
        let handlerCalled3 = false;

        let promiseSettled = false;

        const disconnect1 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled1 = true;
                    resolve();
                }, 4 * 100);
            });
        });
        const disconnect2 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled2 = true;
                    resolve();
                }, 3 * 100);
            });
        });
        const disconnect3 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled3 = true;
                    resolve();
                }, 5 * 100);
            });
        });
        onStringEvent.emitAll().then(() => {
            promiseSettled = true;
        });
        await promiseTimeout(2 * 100);
        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(handlerCalled3).to.be.equal(false);
        expect(promiseSettled).to.be.equal(false);

        await promiseTimeout(4 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);
        expect(handlerCalled3).to.be.equal(true);
        expect(promiseSettled).to.be.equal(true);

        disconnect1();
        disconnect2();
        disconnect3();
    }).timeout(1000);

    it('emitRace - promise settles when first handler finishes execution ', async () => {
        const onStringEvent = createEvent<() => void>(EventTypes.Default);

        let emitPromiseSettled = false;
        const disconnect1 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    resolve();
                }, 100);
            });
        });
        const disconnect2 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    resolve();
                }, 2 * 100);
            });
        });
        const disconnect3 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    resolve();
                }, 2 * 100);
            });
        });

        onStringEvent.emitRace().then(() => {
            emitPromiseSettled = true;
        });
        expect(emitPromiseSettled).to.be.equal(false);

        // one of the handlers finished execution
        await promiseTimeout(3 * 100);

        expect(emitPromiseSettled).to.be.equal(true);

        disconnect1();
        disconnect2();
        disconnect3();
    }).timeout(1000);

    it('emitRace reject - first handler rejects', async () => {
        const onStringEvent = createEvent<() => void>(EventTypes.Default);

        let emitPromiseRejected = false;
        let secondHandlerExecuted = false;
        const disconnect1 = onStringEvent(() => {
            return new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    reject('This is the reject reason');
                }, 2 * 100);
            });
        });
        const disconnect2 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    secondHandlerExecuted = true;
                    resolve();
                }, 5 * 100);
            });
        });

        onStringEvent
            .emitRace()
            .then(() => {})
            .catch(() => {
                emitPromiseRejected = true;
            });

        expect(emitPromiseRejected).to.be.equal(false);

        // one of the handlers finished execution
        await promiseTimeout(3 * 100);
        expect(emitPromiseRejected).to.be.equal(true);
        expect(secondHandlerExecuted).to.be.equal(false);

        await promiseTimeout(5 * 100);

        disconnect1();
        disconnect2();
    }).timeout(1000);

    it('emitAll reject - one handler rejects', async () => {
        const onStringEvent = createEvent<() => void>(EventTypes.Default, true);

        let handlerCalled1 = false;
        let handlerCalled2 = false;
        let handlerCalled3 = false;
        let promiseRejected = false;

        const disconnect1 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled1 = true;
                    resolve();
                }, 3 * 100);
            });
        });
        const disconnect2 = onStringEvent(() => {
            return new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    handlerCalled2 = true;
                    reject('Second handler rejected');
                }, 2 * 100);
            });
        });
        const disconnect3 = onStringEvent(() => {
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    handlerCalled3 = true;
                    resolve();
                }, 4 * 100);
            });
        });

        onStringEvent
            .emitAll()
            .then(() => {})
            .catch(() => {
                promiseRejected = true;
            });

        await promiseTimeout(100);
        expect(handlerCalled1).to.be.equal(false);
        expect(handlerCalled2).to.be.equal(false);
        expect(handlerCalled3).to.be.equal(false);
        expect(promiseRejected).to.be.equal(false);

        await promiseTimeout(3 * 100);
        expect(handlerCalled1).to.be.equal(true);
        expect(handlerCalled2).to.be.equal(true);
        expect(handlerCalled3).to.be.equal(true);
        expect(promiseRejected).to.be.equal(true);

        disconnect1();
        disconnect2();
        disconnect3();
    }).timeout(1000);

    after(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });
});
