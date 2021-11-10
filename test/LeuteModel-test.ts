import {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, registerRecipes} from '@refinio/one.core/lib/instance';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import * as StorageTestInit from '@refinio/one.core/test/_helpers';
import {InstancesModel, LeuteModel} from '../lib/models';
import {expect} from "chai";

describe('LeuteModel test', function () {
    let instancesModel: InstancesModel;
    let leuteModel: LeuteModel;

    beforeEach(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();

        instancesModel = new InstancesModel();
        leuteModel = new LeuteModel(instancesModel, 'localhost');
        await instancesModel.init('abc');
        await leuteModel.init();
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

    afterEach(async function () {
        await leuteModel.shutdown();
        //await instancesModel.shutdown();
        await new Promise(resolve => setTimeout(resolve, 1000));
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });
});
