/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
import Recipes from '../lib/recipies/recipies';
import Model, {importModules} from './utils/Model';
import {AccessGroupNames} from '../lib/models/ChannelManager';

const channelManager = new Model().channelManager;

describe('AccessRights model test', () => {
    before(async () => {
        await StorageTestInit.init();
        await registerRecipes(Recipes);
        await importModules();
    });

    it('should see if the access groups were created on init', async () => {
        await channelManager.init();
        const partnerGroup = await channelManager.getAccessGroupByName(AccessGroupNames.partners);
        const clinicGroup = await channelManager.getAccessGroupByName(AccessGroupNames.clinic);
        expect(partnerGroup).to.not.be.undefined;
        expect(clinicGroup).to.not.be.undefined;
    });

    it('should get a group by name', async () => {
        const partnerGroup = await channelManager.getAccessGroupByName(AccessGroupNames.partners);
        const clinicGroup = await channelManager.getAccessGroupByName(AccessGroupNames.clinic);
        expect(partnerGroup).to.not.be.undefined;
        expect(clinicGroup).to.not.be.undefined;
        try {
            await channelManager.getAccessGroupByName('undefined');
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
                type: 'Person',
                email: 'foo@refinio.net'
            }
        );
        await channelManager.addPersonToAccessGroup(AccessGroupNames.partners, newPerson.idHash);
        const partnerGroup = await channelManager.getAccessGroupByName(AccessGroupNames.partners);
        expect(partnerGroup.obj.person[0]).to.be.equal(newPerson.idHash);
    });

    it('should add an existing person to an access group', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'foo@refinio.net'
            }
        );
        await channelManager.addPersonToAccessGroup(AccessGroupNames.partners, newPerson.idHash);
        const partnerGroup = await channelManager.getAccessGroupByName(AccessGroupNames.partners);
        expect(partnerGroup.obj.person.length).to.be.equal(1);
    });
});
