import ConsentModel from '../lib/models/ConsentModel';
import {expect} from 'chai';
import {readFile} from 'fs/promises';
import * as StorageTestInit from './_helpers';
import TestModel, {importModules} from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';

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
        const consetnModel = new ConsentModel();
        expect(consetnModel.consentState.currentState).to.equal('Uninitialised');
    });

    it('should add a conset to the queue', async function () {
        const consentModel = new ConsentModel();
        const consentFile = await readFile('./test/consent.pdf');

        await consentModel.setConsent(consentFile, 'given');
    });

    it('should write consent to channel ', async function () {
        const consentModel = new ConsentModel();

        const consentFile = await readFile('./test/consent.pdf');

        await consentModel.setConsent(consentFile, 'given');
        console.log(consentModel.consentsToWrite.length);

        await consentModel.init(testModel.channelManager);
        console.log(consentModel.consentState.currentState);

        const latestChannelEntry = await testModel.channelManager.getObjects({
            channelId: ConsentModel.channelId,
            count: 1
        });

        console.log('latestChannelEntry', latestChannelEntry);
    });
});
