import ConsentModel from '../lib/models/ConsentModel';
import {expect} from 'chai';
import * as StorageTestInit from './_helpers';
import TestModel, {importModules} from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import {buildTestFile} from './_helpers';

let testModel: TestModel;

describe('Consent', () => {
    before(async () => {
        await StorageTestInit.init();
        await importModules();
        const model = new TestModel('ws://localhost:8000');
        await model.init(undefined);
        testModel = model;
    });
    after(async () => {
        await testModel.shutdown();
        await closeAndDeleteCurrentInstance();
    });

    it('should be uninitialised', function () {
        //test
        const consentModel = new ConsentModel();
        expect(consentModel.consentState.currentState).to.equal('Uninitialised');
    });

    it('should add a conset to the queue', async function () {
        const consentModel = new ConsentModel();
        const consentFile = buildTestFile();

        await consentModel.setConsent(consentFile, 'given');
    });

    it('should write consent to channel after one is initialized ', async function () {
        const consentModel = new ConsentModel();
        const file = buildTestFile();

        await consentModel.setConsent(file, 'given');

        // equals ONE is initialized
        await consentModel.init(testModel.channelManager);

        expect(consentModel.consentState.currentState).to.equal('Given');
    });

    it('should change the state from given to revoked', async function () {
        const consentModel = new ConsentModel();
        const file = buildTestFile();

        await consentModel.setConsent(file, 'revoked');
        expect(consentModel.consentState.currentState).to.equal('Revoked');
    });

    it('should load latest state from storage', async function () {
        const consentModel = new ConsentModel();
        expect(consentModel.consentState.currentState).to.equal('Uninitialised');

        // equals ONE is initialized
        await consentModel.init(testModel.channelManager);

        // the latest WRITTEN consent was in test "should write consent to channel after one is initialized"
        expect(consentModel.consentState.currentState).to.equal('Given');
    });

    it('should trigger something on state beeng revoked', async function () {
        const consentModel = new ConsentModel();
        expect(consentModel.consentState.currentState).to.equal('Uninitialised');

        const onEnterRevokeState = new Promise(resolve => {
            consentModel.consentState.onEnterState(state => {
                if (state == 'Revoked') {
                    resolve('Close connection to replicant');
                }
            });
        });

        const file = buildTestFile();
        await consentModel.setConsent(file, 'given');
        await consentModel.setConsent(file, 'revoked');

        const revoked = await onEnterRevokeState;
        expect(revoked).to.equal('Close connection to replicant');
    });

    it('should have the revoked state after init if the last stored consent was revoked', async function () {
        const consentModel = new ConsentModel();
        const file = buildTestFile();

        await consentModel.setConsent(file, 'revoked');

        // equals ONE is initialized
        await consentModel.init(testModel.channelManager);
        await consentModel.shutdown();

        expect(consentModel.consentState.currentState).to.equal('Uninitialised');

        await consentModel.init(testModel.channelManager);
        expect(consentModel.consentState.currentState).to.equal('Revoked');
    });
});