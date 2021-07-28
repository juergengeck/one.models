/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {expect} from 'chai';

import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdObj,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import type AccessModel from '../lib/models/AccessModel';

let accessModel: AccessModel;
let testModel: TestModel;

describe('AccessRights model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
        accessModel = model.accessModel;
    });

    it('should see if the access groups were created on init', async () => {
        await accessModel.init();
        await accessModel.createAccessGroup('partners');
        await accessModel.createAccessGroup('clinic');

        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        const clinicGroup = await accessModel.getAccessGroupByName('clinic');
        expect(partnerGroup).to.not.be.undefined;
        expect(clinicGroup).to.not.be.undefined;
    });

    it('should get a group by name', async () => {
        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        const clinicGroup = await accessModel.getAccessGroupByName('clinic');
        expect(partnerGroup).to.not.be.undefined;
        expect(clinicGroup).to.not.be.undefined;
        try {
            //@ts-ignore
            await accessModel.getAccessGroupByName('undefined');
        } catch (e) {
            expect(e).to.be.not.undefined;
        }
    });

    it('should add person to an access group', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Person',
                email: 'foo@refinio.net'
            }
        );
        await accessModel.addPersonToAccessGroup('partners', newPerson.idHash);
        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        expect(partnerGroup.obj.person[0]).to.be.equal(newPerson.idHash);
    });

    it('should add an existing person to an access group', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Person',
                email: 'foo@refinio.net'
            }
        );
        await accessModel.addPersonToAccessGroup('partners', newPerson.idHash);
        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        expect(partnerGroup.obj.person.length).to.be.equal(1);
    });

    it('should delete a person from an access group', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        await accessModel.removePersonFromAccessGroup('partners', person.idHash);
        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        expect(partnerGroup.obj.person).to.have.length(0);
    });

    it('should delete a fake person from an access group', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Person',
                email: 'foo111@refinio.net'
            }
        );
        await accessModel.removePersonFromAccessGroup('partners', newPerson.idHash);
        const partnerGroup = await accessModel.getAccessGroupByName('partners');
        expect(partnerGroup.obj.person).to.have.length(0);
    });

    it('should list persons for an access group', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Person',
                email: 'foo@refinio.net'
            }
        );
        await accessModel.addPersonToAccessGroup('partners', newPerson.idHash);
        const persons = await accessModel.getAccessGroupPersons('partners');
        expect(persons).to.have.length(1);
    });

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
        await StorageTestInit.deleteTestDB();
    });
});
