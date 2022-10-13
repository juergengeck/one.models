import {importModules} from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import * as StorageTestInit from './_helpers';
import {LeuteModel} from '../lib/models';
import {expect} from 'chai';

describe('LeuteModel test', function () {
    let leuteModel: LeuteModel;

    beforeEach(async () => {
        await StorageTestInit.init();
        await importModules();

        leuteModel = new LeuteModel('localhost');
        await leuteModel.init();
    });

    afterEach(async function () {
        await leuteModel.shutdown();
        await closeAndDeleteCurrentInstance();
    });

    it('should create groups module', async function () {
        expect((await leuteModel.groups()).length).to.be.equal(0);

        // Test with one empty group
        await leuteModel.createGroup('devs');
        const groups = await leuteModel.groups();
        expect(groups.length).to.be.equal(1);
        expect(groups[0].name).to.be.equal('devs');
        expect(groups[0].persons.length).to.be.equal(0);

        // Add a person to the group and set the name
        groups[0].name = 'sissis';
        groups[0].persons.push((await leuteModel.me()).identities()[0]);
        await groups[0].saveAndLoad();

        // Test if name and persons are correct
        const groups2 = await leuteModel.groups();
        expect(groups2[0].persons.length).to.be.equal(1);
        expect(groups2[0].name).to.be.equal('sissis');
        expect(groups2[0].picture).to.be.undefined;
    });
});
