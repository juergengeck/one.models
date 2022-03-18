import ConsentModel from '../lib/models/ConsentModel';
import {expect} from 'chai';
import {readFile} from 'fs/promises';
import * as StorageTestInit from './_helpers';
import TestModel, {importModules} from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import path from 'path';
import {statSync} from 'fs';

let testModel: TestModel;

function buildTestFile(): File {
    const filePath = './test/consent.pdf';
    const stats = statSync(filePath);

    // @ts-ignore enough for the test
    return {
        lastModified: stats.ctimeMs,
        name: path.basename(filePath),
        size: stats.size,
        type: 'application/pdf',
        arrayBuffer: () => readFile(filePath)
    };
}

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
        const consetnModel = new ConsentModel();
        expect(consetnModel.consentState.currentState).to.equal('Uninitialised');
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
        console.log('currrent state', consentModel.consentState.currentState);

        // the latest WRITTEN consent was in test "should write consent to channel after one is initialized"
        expect(consentModel.consentState.currentState).to.equal('Given');
    });
});
