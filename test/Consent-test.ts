import ConsentModel from '../lib/models/ConsentModel';
import {expect} from 'chai';
import {readFile} from 'fs/promises';

describe('Consent', () => {
    it('should be uninitialised', function () {
        //test
        const consetnModel = new ConsentModel();
        expect(consetnModel.consentState.currentState).to.equal('Uninitialised');
    });
    it('should add a conset to the queue', async function () {
        const consentModel = new ConsentModel();
        const consentFile = await readFile('./test/consent.pdf');

        await consentModel.setConsent(consentFile, 'given');
        console.log(consentModel.consentsToWrite.length);
    });
    it('should ', function () {
        const consentModel = new ConsentModel();
        console.log(consentModel.consentsToWrite.length);
    });
});
