/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {getInstanceIdHash, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import Recipes from '../lib/recipies/recipies';
import Model, {createRandomBodyTemperature, importModules} from './utils/Model';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
import {ChannelManager} from '../lib/models';
import {expect} from 'chai';
import {Person, SHA256Hash, SHA256IdHash, BodyTemperature} from '@OneCoreTypes';

const channelManager = new Model().channelManager;
const channelsIdentifiers = ['first', 'second', 'third'];
const howMany = 20;
let owner: SHA256IdHash<Person>;
let specificObjectHash: SHA256Hash<BodyTemperature>;
describe('Channel Iterators test', () => {
    before(async () => {
        await StorageTestInit.init();
        await registerRecipes(Recipes);
        await importModules();
        owner = (
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    type: 'Person',
                    email: 'foo@refinio.net'
                }
            )
        ).idHash;
    });

    it('should create channels and init channelManager', async () => {
        await channelManager.init();
        await channelManager.createChannel('first');
        await channelManager.createChannel('second');
        await channelManager.createChannel('third');
    });

    it('should add data to created channels', async () => {
        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                for (let i = 0; i < howMany; i++) {
                    await channelManager.postToChannel(identifier, createRandomBodyTemperature());
                }
            })
        );
        const channelRegistry = await ChannelManager.getChannelRegistry();
        expect(channelRegistry.obj.channels).to.have.length(channelsIdentifiers.length);
    });

    it('should get objects', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            expect(objects1).to.have.length(howMany - 1);
        }
    });

    it('should create second tier of channels but for another user and add data to them', async () => {
        for (const channelId of channelsIdentifiers) {
            await createSingleObjectThroughPurePlan(
                {module: '@module/createChannel'},
                channelId,
                owner
            );
        }
        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                for (let i = 0; i < howMany; i++) {
                    await channelManager.postToChannel(
                        identifier,
                        createRandomBodyTemperature(),
                        owner
                    );
                }
            })
        );

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            expect(objects1).to.have.length(howMany * 2);
        }
    });

    /** Tests for getObjects **/

    it('should test getObjects with queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                owner: owner
            });
            expect(objects1).to.have.length(howMany);
        }
    });
    it('should test getObjects with no queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            expect(objects1).to.have.length(howMany * 2);
        }
    });
    it('should test getObjects with queryOptions.from and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;

            const objectsFrom = await channelManager.getObjects(channelId, {
                owner: owner,
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length(howMany / 2);
        }
    });
    it('should test getObjects with queryOptions.from and queryOptions.to and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;
            const objectsFrom = await channelManager.getObjects(channelId, {
                owner: owner,
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFrom).to.have.length(howMany / 2 - 1);
        }
    });
    it('should test getObjects with queryOptions.count and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                owner: owner,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjects with queryOptions.count, queryOptions.form and queryOption.to and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;

            const trueLen = objects1.length / 2 - 1;

            const objectsFromToWithOwner = await channelManager.getObjects(channelId, {
                owner: owner,
                count: count,
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFromToWithOwner).to.have.length(trueLen);
        }
    });
    it('should test getObjects with queryOptions.from and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            const from = objects1[objects1.length / 2].date;

            const objectsFrom = await channelManager.getObjects(channelId, {
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length((howMany * 2) / 2);
        }
    });
    it('should test getObjects with queryOptions.from and queryOptions.to and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;
            const objectsFrom = await channelManager.getObjects(channelId, {
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFrom).to.have.length((howMany * 2) / 2 - 1);
        }
    });
    it('should test getObjects with queryOptions.count and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId, {
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjects with queryOptions.count, queryOptions.form and queryOption.to and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjects(channelId);
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;

            const objectsFromToWithOwner = await channelManager.getObjects(channelId, {
                count: count,
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFromToWithOwner).to.have.length(count);
        }
    });

    /** Tests for getObjectsWithType **/

    it('should test getObjectsWithType with specific type and queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                owner: owner
            });
            expect(objects1).to.have.length(howMany);
        }
    });
    it('should test getObjectsWithType with specific type and no queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature');
            expect(objects1).to.have.length(howMany * 2);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.from and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;

            const objectsFrom = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    owner: owner,
                    from: new Date(from)
                }
            );
            expect(objectsFrom).to.have.length(howMany / 2);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.from and queryOptions.to and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;
            const objectsFrom = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    owner: owner,
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFrom).to.have.length(howMany / 2 - 1);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.count and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                owner: owner,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.count, queryOptions.form and queryOption.to and OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                owner: owner
            });
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;

            const trueLen = objects1.length / 2 - 1;

            const objectsFromToWithOwner = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    owner: owner,
                    count: count,
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFromToWithOwner).to.have.length(trueLen);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.from and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature');
            const from = objects1[objects1.length / 2].date;

            const objectsFrom = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    from: new Date(from)
                }
            );
            expect(objectsFrom).to.have.length((howMany * 2) / 2);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.from and queryOptions.to and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature');
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;
            const objectsFrom = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFrom).to.have.length((howMany * 2) / 2 - 1);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.count and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature', {
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjectsWithType with specific type and queryOptions.count, queryOptions.form and queryOption.to and NO-OWNER', async () => {
        const count = 10;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'BodyTemperature');
            const from = objects1[objects1.length / 2].date;
            const to = objects1[objects1.length - 2].date;

            const objectsFromToWithOwner = await channelManager.getObjectsWithType(
                channelId,
                'BodyTemperature',
                {
                    count: count,
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFromToWithOwner).to.have.length(count);
        }
    });
    it('should test getObjectsWithType with no specific type and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectsWithType(channelId, 'Person');
            expect(objects1).to.have.length(0);
        }
    });

    /** Tests for getObjectById **/

    it('should add a specific bodyTemperature to every channel of another user', async () => {
        const bodyTemperatureObject = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'BodyTemperature',
                temperature: 35
            }
        );

        specificObjectHash = bodyTemperatureObject.hash;

        await Promise.all(
            channelsIdentifiers.map(async (identifier: string) => {
                await channelManager.postToChannel(identifier, bodyTemperatureObject.obj, owner);
            })
        );
    });

    it('should test getObjectById with specific id and queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner
            });
            expect(objects1).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and no queryOptions.owner', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash);
            expect(objects1).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.from and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner
            });
            const from = objects1[0].date;

            const objectsFrom = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner,
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.from and queryOptions.to and OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner
            });
            const from = objects1[0].date;
            const to = objects1[0].date;
            const objectsFrom = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner,
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFrom).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.count and OWNER', async () => {
        const count = 1;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner,
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjectById with specific id and queryOptions.count, queryOptions.form and queryOption.to and OWNER', async () => {
        const count = 1;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                owner: owner
            });
            const from = objects1[0].date;
            const to = objects1[0].date;

            const objectsFromToWithOwner = await channelManager.getObjectById(
                channelId,
                specificObjectHash,
                {
                    owner: owner,
                    count: count,
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFromToWithOwner).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.from and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash);
            const from = objects1[0].date;

            const objectsFrom = await channelManager.getObjectById(channelId, specificObjectHash, {
                from: new Date(from)
            });
            expect(objectsFrom).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.from and queryOptions.to and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash);
            const from = objects1[0].date;
            const to = objects1[objects1.length - 1].date;
            const objectsFrom = await channelManager.getObjectById(channelId, specificObjectHash, {
                from: new Date(from),
                to: new Date(to)
            });
            expect(objectsFrom).to.have.length(1);
        }
    });
    it('should test getObjectById with specific id and queryOptions.count and NO-OWNER', async () => {
        const count = 1;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash, {
                count: count
            });
            expect(objects1).to.have.length(count);
        }
    });
    it('should test getObjectById with specific id and queryOptions.count, queryOptions.form and queryOption.to and NO-OWNER', async () => {
        const count = 1;

        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectById(channelId, specificObjectHash);
            const from = objects1[0].date;
            const to = objects1[objects1.length - 1].date;

            const objectsFromToWithOwner = await channelManager.getObjectById(
                channelId,
                specificObjectHash,
                {
                    count: count,
                    from: new Date(from),
                    to: new Date(to)
                }
            );
            expect(objectsFromToWithOwner).to.have.length(count);
        }
    });
    it('should test getObjectById with no specific type and NO-OWNER', async () => {
        for (const channelId of channelsIdentifiers) {
            try {
                await channelManager.getObjectById(channelId, 'Non-existing hash');
            } catch (e) {
                expect(e).to.not.be.undefined;
            }
        }
    });

    /** Tests for getObjectWithTypeById **/

    it('should test getObjectWithTypeById with type and ID for the right user', async () => {
        for (const channelId of channelsIdentifiers) {
            const objects1 = await channelManager.getObjectWithTypeById(
                channelId,
                specificObjectHash,
                'BodyTemperature',
                {
                    owner: owner
                }
            );
            expect(objects1).to.have.length(1);
        }
    });

    it('should test getObjectWithTypeById with type and ID for the wrong user', async () => {
        for (const channelId of channelsIdentifiers) {
            try {
                await channelManager.getObjectWithTypeById(
                    channelId,
                    specificObjectHash,
                    'BodyTemperature',
                    {
                        owner: getInstanceIdHash()
                    }
                );
            } catch (e) {
                expect(e).to.not.be.undefined;
            }
        }
    });

    it('should test getObjectWithTypeById with type and ID with no user', async () => {
        for (const channelId of channelsIdentifiers) {
            try {
                await channelManager.getObjectWithTypeById(
                    channelId,
                    specificObjectHash,
                    'BodyTemperature'
                );
            } catch (e) {
                expect(e).to.not.be.undefined;
            }
        }
    });
});
