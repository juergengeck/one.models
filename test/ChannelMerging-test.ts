/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import Recipes from '../lib/recipies/recipies';
import Model, {createRandomBodyTemperature, dbKey, importModules} from './utils/Model';
import {ChannelManager} from "../lib/models";
import {getAllVersionMapEntries} from "one.core/lib/storage";

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
        console.log(await channelManager.getObjects('first'));
        const channelInfoIdHash = channelRegistry.obj.channels[0];
        const versions = await getAllVersionMapEntries(channelInfoIdHash);
        //const mergedChannel = await channelManager.mergeChannels(versions[versions.length - 1].hash, versions[versions.length-5].hash);
        console.log(await channelManager.getObjects('first'));

    });

    after(async () => {
        closeInstance();
        await StorageTestInit.deleteTestDB('./test/' + dbKey);
    });
});
