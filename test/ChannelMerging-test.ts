/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import Recipes from '../lib/recipies/recipies';
import Model, {createRandomBodyTemperature, dbKey, importModules} from './utils/Model';
import {ChannelManager} from "../lib/models";
import {
    createSingleObjectThroughPurePlan,
    getAllVersionMapEntries,
    getObject,
    getObjectByIdHash, VERSION_UPDATES
} from "one.core/lib/storage";
import {calculateHashOfObj} from "one.core/lib/util/object";

let channelManager: ChannelManager;
const channelsIdentifiers = ['first'];
const howMany = 20;

describe('Channel Merging test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes(Recipes);
        await importModules();
        channelManager = new Model().channelManager;
    });

    it('should create data for a channel', async () => {
        await channelManager.init();
        await channelManager.createChannel('first');
    });

    it('should add data to created channel', async () => {
        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                for (let i = 0; i < howMany; i++) {
                    await channelManager.postToChannel(identifier, {
                        type: 'BodyTemperature',
                        temperature: i
                    });
                }
            })
        );
        const channelRegistry = await ChannelManager.getChannelRegistry();
        expect(channelRegistry.obj.channels).to.have.length(channelsIdentifiers.length);
    });

    it('should merge 2 versions of the created channel', async () => {
        const channelRegistry = await ChannelManager.getChannelRegistry();
        //await channelManager.getObjects('first')
        const channelInfoIdHash = channelRegistry.obj.channels[0];
        const versions = await getAllVersionMapEntries(channelInfoIdHash);
        await channelManager.mergeChannels(versions[versions.length - 1].hash, versions[0].hash);
        const objects = await channelManager.getObjects('first');
        expect(objects).to.have.length(howMany);
    });


    it('should merge 2 very different versions of created channel', async () => {
        const channelRegistry = await ChannelManager.getChannelRegistry();
        const channelInfoIdHash = channelRegistry.obj.channels[0];
        const channelInfo = await getObjectByIdHash(channelInfoIdHash);
        const bodyTemp =
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    type: 'BodyTemperature',
                    temperature: 11111111
                }
            );

        const creationTime = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'CreationTime',
                timestamp: Date.now(),
                data: bodyTemp.hash
            }
        );
        const channelEntry = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'ChannelEntry',
                data: creationTime.hash
            }
        );
        channelInfo.obj.head = channelEntry.hash;
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            channelInfo.obj
        );


        const versions = await getAllVersionMapEntries(channelInfoIdHash);
        await channelManager.mergeChannels(versions[versions.length - 2].hash, versions[versions.length - 1].hash);
        const objects = await channelManager.getObjects('first');
        expect(objects).to.have.length(howMany + 1);
    });

    after(async () => {
        closeInstance();
        await StorageTestInit.deleteTestDB('./test/' + dbKey);
    });
});
