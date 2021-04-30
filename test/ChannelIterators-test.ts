/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import TestModel, {
    createRandomBodyTemperature,
    dbKey,
    importModules,
    removeDir
} from './utils/TestModel';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    getObjectByIdHash
} from 'one.core/lib/storage';
import {ChannelManager} from '../lib/models';
import {expect} from 'chai';
import {ChannelRegistry, BodyTemperature} from '@OneObjectInterfaces';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import rimraf from 'rimraf';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

let channelManager: typeof ChannelManager;
let testModel;
const channelsIdentifiers = ['first', 'second', 'third'];
const howMany = 20;
let owner: SHA256IdHash<Person>;
let specificObjectHash: SHA256Hash<BodyTemperature>;

async function getChannelRegistry() {
    const registryIdHash: SHA256IdHash<ChannelRegistry> = await calculateIdHashOfObj({
        $type$: 'ChannelRegistry',
        id: 'ChannelRegistry'
    });
    return await getObjectByIdHash(registryIdHash);
}

describe('Channel Iterators test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        // @ts-ignore
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        owner = (
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
        ).idHash;
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;

        channelManager = model.channelManager;
    });

    it('should create channels and init channelManager', async () => {
        await channelManager.createChannel('first');
        await channelManager.createChannel('second');
        await channelManager.createChannel('third');
    });

    it('should get zero objects by iterator', async () => {
        for (const channelId of channelsIdentifiers) {
            let iterCount = 0;
            for await (const {} of channelManager.objectIterator(channelId, {})) {
                ++iterCount;
            }
            expect(iterCount).to.be.equal(0);
        }
    });

    it('should get zero objects by getObjects', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            expect(objects1).to.have.length(0);
        }
    });

    it('should add data to created channels', async () => {
        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                for (let i = 0; i < howMany; i++) {
                    await channelManager.postToChannel(identifier, {
                        $type$: 'BodyTemperature',
                        temperature: Math.random()
                    });
                    await new Promise((resolve, rejects) => {
                        setTimeout(() => resolve(), 300);
                    });
                }
            })
        );
        const channelRegistry = Array.from((await getChannelRegistry()).obj.channels.keys());
        expect(channelRegistry).to.have.length(channelsIdentifiers.length * 2);
    }).timeout(20000);

    it('should get objects', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId});
            await new Promise((resolve, rejects) => {
                setTimeout(() => resolve(), 500);
            });
            expect(objects1).to.have.length(howMany);
        }
    });

    it('should create second tier of channels but for another user and add data to them', async () => {
        for (const channelId of channelsIdentifiers) {
            await createSingleObjectThroughPurePlan(
                {module: '@module/channelCreate'},
                channelId,
                owner
            );
        }
        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                for (let i = 0; i < howMany; i++) {
                    await channelManager.postToChannel(
                        identifier,
                        {$type$: 'BodyTemperature', temperature: Math.random()},
                        owner
                    );
                    await new Promise((resolve, rejects) => {
                        setTimeout(() => resolve(), 100);
                    });
                }
            })
        );

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId});
            expect(objects1).to.have.length(howMany * 2);
        }
    }).timeout(20000);

    /** Tests for getObjects **/

    it('should test getObjects with queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId, owner});
            expect(objects1).to.have.length(howMany);
        }
    });
    it('should test getObjects with no queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId});
            expect(objects1).to.have.length(howMany * 2);
        }
    });
    it('should test getObjects with queryOptions.from and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId, owner});
            const from = objects1[objects1.length / 2].creationTime;

            const objectsFrom = await channelManager.getObjects({
                channelId,
                owner,
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length(howMany / 2);
        }
    });
    //@todo FIX
    /*it('should test getObjects with queryOptions.from and queryOptions.to and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId, owner});
            const from = objects1[objects1.length / 2].creationTime;
            const to = objects1[objects1.length - 2].creationTime;
            console.log(from, to);
            const objectsFrom = await channelManager.getObjects({
                channelId,
                owner,
                from: from,
                to: to
            });
            expect(objectsFrom).to.have.length(howMany / 2 - 1);
        }
    });*/
    it('should test getObjects with queryOptions.count and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({
                channelId,
                owner: owner,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    //@todo FIX
    /* it('should test getObjects with queryOptions.count, queryOptions.form and queryOption.to and OWNER', async () => {
         const count = 10;

         for (const channelId of channelsIdentifiers) {
             const objects1 = await channelManager.getObjects({channelId, owner});
             const from = objects1[objects1.length / 2].creationTime;
             const to = objects1[objects1.length - 2].creationTime;

             const trueLen = objects1.length / 2 - 1;

             const objectsFromToWithOwner = await channelManager.getObjects({
                 owner: owner,
                 channelId,
                 count: count,
                 from: from,
                 to: to
             });
             expect(objectsFromToWithOwner).to.have.length(trueLen);
         }
     });*/
    it('should test getObjects with queryOptions.from and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({channelId});
            const from = objects1[objects1.length / 2].creationTime;

            const objectsFrom = await channelManager.getObjects({
                channelId,
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length((howMany * 2) / 2);
        }
    });
    //@todo FIX
    /* it('should test getObjects with queryOptions.from and queryOptions.to and NO-OWNER', async () => {
         for (const channelId of channelsIdentifiers) {
             const objects1 = await channelManager.getObjects({channelId});
             const from = objects1[objects1.length / 2].creationTime;
             const to = objects1[objects1.length - 2].creationTime;
             const objectsFrom = await channelManager.getObjects({
                 channelId,
                 from: from,
                 to: to
             });
             expect(objectsFrom).to.have.length((howMany * 2) / 2 - 1);
         }
     });*/
    it('should test getObjects with queryOptions.count and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects({
                channelId,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    //@todo FIX
    /* it('should test getObjects with queryOptions.count, queryOptions.form and queryOption.to and NO-OWNER', async () => {
         const count = 10;

         for (const channelId of channelsIdentifiers) {
             const objects1 = await channelManager.getObjects({channelId});
             const from = objects1[objects1.length / 2].creationTime;
             const to = objects1[objects1.length - 2].creationTime;

             const objectsFromToWithOwner = await channelManager.getObjects({
                 channelId,
                 count: count,
                 from: from,
                 to: to
             });
             expect(objectsFromToWithOwner).to.have.length(count);
         }
     });*/

    /** Tests for getObjectsWithType **/

    it('should test getObjectsWithType with specific type and queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                owner: owner
            });
            expect(objects1).to.have.length(howMany);
        }
    });
    it('should test getObjectsWithType with specific type and no queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId
            });
            expect(objects1).to.have.length(howMany * 2);
        }
    });
    //@todo FIX

    /* it('should test getObjectsWithType with specific type and queryOptions.from and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                owner: owner
            });
            const from = objects1[objects1.length / 2].creationTime;

            const objectsFrom = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                owner: owner,
                from: from
            });
            expect(objectsFrom).to.have.length(howMany / 2);
        }
    });*/
    //@todo FIX
    /*it('should test getObjectsWithType with specific type and queryOptions.from and queryOptions.to and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                owner: owner
            });
            const from = objects1[objects1.length / 2].creationTime;
            const to = objects1[objects1.length - 2].creationTime;
            const objectsFrom = await channelManager.getObjectsWithType('BodyTemperature', {
                owner: owner,
                channelId,
                from: from,
                to: to
            });
            expect(objectsFrom).to.have.length(howMany / 2 - 1);
        }
    });*/
    it('should test getObjectsWithType with specific type and queryOptions.count and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                owner: owner,
                channelId,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    //@todo FIX
    /*it('should test getObjectsWithType with specific type and queryOptions.count, queryOptions.form and queryOption.to and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                owner: owner,
                channelId
            });
            const from = objects1[objects1.length / 2].creationTime;
            const to = objects1[objects1.length - 2].creationTime;

            const trueLen = objects1.length / 2 - 1;

            const objectsFromToWithOwner = await channelManager.getObjectsWithType(
                'BodyTemperature',
                {
                    owner: owner,
                    channelId,
                    count: count,
                    from: from,
                    to: to
                }
            );
            expect(objectsFromToWithOwner).to.have.length(trueLen);
        }
    });*/
    //@todo FIX
    /*it('should test getObjectsWithType with specific type and queryOptions.from and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId
            });
            const from = objects1[objects1.length / 2].creationTime;

            const objectsFrom = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length((howMany * 2) / 2);
        }
    });*/
    //@todo FIX

    /*  it('should test getObjectsWithType with specific type and queryOptions.from and queryOptions.to and NO-OWNER', async () => {
          for (const channelId of channelsIdentifiers) {
              const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                  channelId
              });
              const from = objects1[objects1.length / 2].creationTime;
              const to = objects1[objects1.length - 2].creationTime;
              const objectsFrom = await channelManager.getObjectsWithType('BodyTemperature', {
                  channelId,
                  from: from,
                  to: to
              });
              expect(objectsFrom).to.have.length((howMany * 2) / 2 - 1);
          }
      });*/
    it('should test getObjectsWithType with specific type and queryOptions.count and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                channelId,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    //@todo FIX
    /* it('should test getObjectsWithType with specific type and queryOptions.count, queryOptions.form and queryOption.to and NO-OWNER', async () => {
         const count = 10;

         for (const channelId of channelsIdentifiers) {
             const objects1 = await channelManager.getObjectsWithType('BodyTemperature', {
                 channelId
             });
             const from = objects1[objects1.length / 2].creationTime;
             const to = objects1[objects1.length - 2].creationTime;

             const objectsFromToWithOwner = await channelManager.getObjectsWithType(
                 'BodyTemperature',
                 {channelId, count: count, from: from, to: to}
             );
             expect(objectsFromToWithOwner).to.have.length(count);
         }
     });*/
    it('should test getObjectsWithType with no specific type and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            //@ts-ignore
            const objects1 = await channelManager.getObjectsWithType('Person', {channelId});
            expect(objects1).to.have.length(0);
        }
    });
    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
        // await StorageTestInit.deleteTestDB();
    });
});
