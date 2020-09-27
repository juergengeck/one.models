import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import Recipes from '../lib/recipes/recipes';
import {dbKey, importModules} from './utils/Model';
import {AccessModel, ChannelManager} from '../lib/models';
import {expect} from 'chai';
import {BodyTemperature} from '@OneCoreTypes';
import {ObjectData, Order} from '../lib/models/ChannelManager';
import {createMessageBus} from 'one.core/lib/message-bus';

const accessModel = new AccessModel();
const channelManager = new ChannelManager(accessModel);

// ######## SPECIALLY FORMATTED LOGGING ########
const enableLogging = false;

let indentationMap = new Map<string, number>(); // Map that stores indention levels based on channels

/**
 * Formats the log message in a special way:
 * splits the message at # and
 * - colors the channel id (first value) yellow (log) or green(debug)
 * - colors the channel owner (second value) blue
 * - indents the third value based on START / END string
 *
 * @param {string} message
 * @param {number} color
 * @returns {string[]}
 */
function format(message: string, color: number): string[] {
    const m = message as string;
    const mArr = m.split('#');
    if (m.length >= 3) {
        const mid = mArr[0];
        if (!indentationMap.has(mid)) {
            indentationMap.set(mid, 0);
        }
        if (mArr[2].includes('END')) {
            // @ts-ignore
            indentationMap.set(mid, indentationMap.get(mid) - 1);
        }
        mArr[0] = mArr[0].padEnd(10, ' ');
        mArr[0] = `\x1b[${color}m${mArr[0]}\x1b[0m`;
        // @ts-ignore
        mArr[1] = mArr[1].padEnd(70 + indentationMap.get(mid), ' ');
        mArr[1] = `\x1b[34m${mArr[1]}\x1b[0m`;
        mArr[2] = mArr[2].replace('START', '\x1b[32mSTART\x1b[0m');
        mArr[2] = mArr[2].replace('ENTER', '\x1b[32mENTER\x1b[0m');
        mArr[2] = mArr[2].replace('END', '\x1b[31mEND\x1b[0m');
        mArr[2] = mArr[2].replace('LEAVE', '\x1b[31mLEAVE\x1b[0m');
        if (mArr[2].includes('START')) {
            // @ts-ignore
            indentationMap.set(mid, indentationMap.get(mid) + 1);
        }
    }
    return mArr;
}

const MessageBus = createMessageBus('dummy');
if (enableLogging) {
    MessageBus.on('ChannelManager:log', (src: string, message: unknown) => {
        const m = format(message as string, 33);
        console.log(...m);
    });
    MessageBus.on('ChannelManager:debug', (src: string, message: unknown) => {
        const m = format(message as string, 32);
        console.log(...m);
    });
}

// ######## SPECIALLY FORMATTED LOGGING - END ########

describe('Channel Iterators test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes(Recipes);
        await importModules();
        /*owner = (
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'Person',
                    email: 'foo@refinio.net'
                }
            )
        ).idHash;*/
    });

    it('should create channels and init channelManager', async () => {
        await channelManager.init();
        await channelManager.createChannel('first');
        await channelManager.createChannel('second');
        await channelManager.createChannel('third');
        await channelManager.createChannel('fourth');
    });

    it('should get zero objects by iterator', async () => {
        expect((await channelManager.objectIterator().next()).done).to.be.true;
    });

    it('should get zero objects by getObjects', async () => {
        expect((await channelManager.getObjects()).length).to.be.equal(0);
    }).timeout(5000);

    it('should add data to created channels', async () => {
        await channelManager.postToChannel('first', {$type$: 'BodyTemperature', temperature: 1});
        await channelManager.postToChannel('second', {$type$: 'BodyTemperature', temperature: 2});
        await channelManager.postToChannel('third', {$type$: 'BodyTemperature', temperature: 3});
        await channelManager.postToChannel('third', {$type$: 'BodyTemperature', temperature: 4});
        await channelManager.postToChannel('second', {$type$: 'BodyTemperature', temperature: 5});
        await channelManager.postToChannel('first', {$type$: 'BodyTemperature', temperature: 6});
        //await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('should get objects with iterator', async () => {
        async function arrayFromAsync(
            iter: AsyncIterable<ObjectData<BodyTemperature>>
        ): Promise<ObjectData<BodyTemperature>[]> {
            const arr = [];
            for await (const elem of iter) {
                arr.push(elem);
            }
            return arr;
        }

        // Check all values
        const allValues = await arrayFromAsync(
            channelManager.objectIteratorWithType('BodyTemperature')
        );
        expect(allValues.map(e => e.data.temperature)).to.be.eql([6, 5, 4, 3, 2, 1]);

        // Check first channel
        const firstValues = await arrayFromAsync(
            channelManager.objectIteratorWithType('BodyTemperature', {
                channelId: 'first'
            })
        );
        expect(firstValues.map(e => e.data.temperature)).to.be.eql([6, 1]);

        // Check second channel
        const secondValues = await arrayFromAsync(
            channelManager.objectIteratorWithType('BodyTemperature', {
                channelId: 'second'
            })
        );
        expect(secondValues.map(e => e.data.temperature)).to.be.eql([5, 2]);

        // Check third channel
        const thirdValues = await arrayFromAsync(
            channelManager.objectIteratorWithType('BodyTemperature', {
                channelId: 'third'
            })
        );
        expect(thirdValues.map(e => e.data.temperature)).to.be.eql([4, 3]);

        // Check fourth channel
        const fourthValues = await arrayFromAsync(
            channelManager.objectIteratorWithType('BodyTemperature', {
                channelId: 'fourth'
            })
        );
        expect(fourthValues.map(e => e.data.temperature)).to.be.eql([]);
    });

    it('should get objects', async () => {
        // Check all values
        const allValuesAsc = await channelManager.getObjectsWithType('BodyTemperature');
        const allValuesDes = await channelManager.getObjectsWithType('BodyTemperature', {
            orderBy: Order.Descending
        });
        expect(allValuesAsc.map(e => e.data.temperature)).to.be.eql([1, 2, 3, 4, 5, 6]);
        expect(allValuesDes.map(e => e.data.temperature)).to.be.eql([6, 5, 4, 3, 2, 1]);

        // Check first channel
        const firstValuesAsc = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'first'
        });
        const firstValuesDes = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'first',
            orderBy: Order.Descending
        });
        expect(firstValuesAsc.map(e => e.data.temperature)).to.be.eql([1, 6]);
        expect(firstValuesDes.map(e => e.data.temperature)).to.be.eql([6, 1]);

        // Check second channel
        const secondValuesAsc = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'second'
        });
        const secondValuesDes = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'second',
            orderBy: Order.Descending
        });
        expect(secondValuesAsc.map(e => e.data.temperature)).to.be.eql([2, 5]);
        expect(secondValuesDes.map(e => e.data.temperature)).to.be.eql([5, 2]);

        // Check third channel
        const thirdValuesAsc = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'third'
        });
        const thirdValuesDes = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'third',
            orderBy: Order.Descending
        });
        expect(thirdValuesAsc.map(e => e.data.temperature)).to.be.eql([3, 4]);
        expect(thirdValuesDes.map(e => e.data.temperature)).to.be.eql([4, 3]);

        // Check fourth channel
        const fourthValuesAsc = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'fourth'
        });
        const fourthValuesDes = await channelManager.getObjectsWithType('BodyTemperature', {
            channelId: 'fourth',
            orderBy: Order.Descending
        });
        expect(fourthValuesAsc.map(e => e.data.temperature)).to.be.eql([]);
        expect(fourthValuesDes.map(e => e.data.temperature)).to.be.eql([]);
    });

    after(async () => {
        // Wait for the hooks to run to completion
        await new Promise(resolve => setTimeout(resolve, 1000));
        closeInstance();
        await StorageTestInit.deleteTestDB();
    });
});
