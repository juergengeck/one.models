/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import Recipes from '../lib/recipes/recipes';
import Model, {dbKey, importModules} from './utils/Model';
import {ChannelManager} from '../lib/models';
import {
    createSingleObjectThroughPurePlan,
    getAllVersionMapEntries, getObjectByIdHash, VERSION_UPDATES,
} from 'one.core/lib/storage';

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
                        $type$: 'BodyTemperature',
                        temperature: i
                    });
                    await new Promise((resolve,rejects) => {
                        setTimeout( () => resolve(), 150);
                    })
                }
            })
        );
        const channelRegistry = await ChannelManager.getChannelRegistry();
        expect(Array.from(channelRegistry.obj.channels.keys())).to.have.length(channelsIdentifiers.length);
    }).timeout(20000);

    it('should merge all versions of a channelInfo between them', async () => {
        const channelRegistry = Array.from((await ChannelManager.getChannelRegistry()).obj.channels.keys());

        const channelInfoIdHash = channelRegistry[0];
        const versions = await getAllVersionMapEntries(channelInfoIdHash);
        for (let i = 0; i < versions.length; i++) {
            for (let j = 0; j < versions.length; j++) {
                await channelManager.mergeChannels(versions[i].hash, versions[j].hash);
                const objects = await channelManager.getObjects('first');
                // console.log(`version[${i}] merging with version[${j}] is having ${i > j ? i : (i < j ? j : i)} channel entries`);
                await new Promise((resolve,rejects) => {
                    setTimeout( () => resolve(), 150);
                });
                expect(objects).to.have.length((i > j ? i : (i < j ? j : i)));
            }
        }
    }).timeout(220000);

    it('should merge 2 very different versions of created channel', async () => {
        const channelRegistry =  Array.from((await ChannelManager.getChannelRegistry()).obj.channels.keys());
        const channelInfoIdHash = channelRegistry[0];
        const channelInfo = await getObjectByIdHash(channelInfoIdHash);
        const bodyTemp =
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'BodyTemperature',
                    temperature: 11111111
                }
            );

        const creationTime = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'CreationTime',
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
                $type$: 'ChannelEntry',
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
        await StorageTestInit.deleteTestDB();
    });
});
