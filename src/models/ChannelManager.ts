import EventEmitter from 'events';
import {
    ChannelEntry,
    ChannelInfo,
    ChannelRegistry,
    CreationTime,
    OneUnversionedObjectInterfaces,
    OneUnversionedObjectTypeNames,
    OneUnversionedObjectTypes,
    Person,
    IdAccess,
    SHA256Hash,
    SHA256IdHash,
    VersionedObjectResult,
    Access
} from '@OneCoreTypes';
import {
    createManyObjectsThroughPurePlan,
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getHashByIdHash,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType,
    onVersionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {calculateHashOfObj, calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {serializeWithType} from 'one.core/lib/util/promise';
import {getNthVersionMapHash} from 'one.core/lib/version-map-query';
import {ReverseMapEntry} from 'one.core/lib/reverse-map-updater';
import AccessModel from './AccessModel';
import {createMessageBus} from 'one.core/lib/message-bus';

const MessageBus = createMessageBus('ChannelManager');

/**
 * Logs a channel manager message.
 *
 * @param {string} channelId
 * @param {SHA256IdHash<Person>} owner
 * @param {string} message
 */
function logWithId(channelId: string, owner: SHA256IdHash<Person> | null, message: string) {
    MessageBus.send('log', `${channelId} + ${owner} # ${message}`);
}
function logWithId_Debug(channelId: string, owner: SHA256IdHash<Person> | null, message: string) {
    MessageBus.send('log', `${channelId} + ${owner} # ${message}`);
}

/**
 * This represents a document but not the content,
 */
export type ChannelInformation = {
    hash: SHA256Hash; // This is the hash of the files object
};

/**
 *  This represents the possible orders of sorting the returned data from the channel.
 */
export enum Order {
    Ascending = 1,
    Descending = 2
}

/**
 * Type defines the query options that can be specified while retrieving data from the channel.
 */
export type QueryOptions = {
    owner?: SHA256IdHash<Person>;
    orderBy?: Order;
    from?: Date;
    to?: Date;
    count?: number;
};

/**
 * Type defines a questionnaire response
 */
export type ObjectData<T> = {
    date: Date;
    id: string;
    author: SHA256IdHash<Person>;
    data: T;
    sharedWith: SHA256IdHash<Person>[];
};

/**
 * Assert that passed object has ChannelInfoResult type.
 *
 * This is required so that typescript stops displaying errors.
 *
 * @param {VersionedObjectResult} versionedObjectResult - the one object
 * @returns {VersionedObjectResult<ChannelInfo>} The same object, just typecasted in a safe way
 */
function isChannelInfoResult(
    versionedObjectResult: VersionedObjectResult
): versionedObjectResult is VersionedObjectResult<ChannelInfo> {
    return (
        (versionedObjectResult as VersionedObjectResult<ChannelInfo>).obj.$type$ === 'ChannelInfo'
    );
}

/**
 * This model manages distributed lists of data in so called 'channels'.
 *
 * A channel is a list of objects stored as merkle tree indexed by time.
 * The list is sorted by creation time so that it can be distributed and merged.
 *
 * Each channel is identified by a channelId (just a string) and the owner.
 * In a distributed network only the owner can create channels.
 * TODO: explain more about access rights and distribution and everything!
 *
 * The structure is as follows:
 * TODO: add PlantUml graph here
 */
export default class ChannelManager extends EventEmitter {
    private defaultOwner: SHA256IdHash<Person> | null;
    private accessModel: AccessModel;
    private readonly boundOnVersionedObjHandler: (
        caughtObject: VersionedObjectResult
    ) => Promise<void>;

    constructor(accessModel: AccessModel) {
        super();
        this.accessModel = accessModel;
        this.boundOnVersionedObjHandler = this.handleOnVersionedObj.bind(this);
        this.defaultOwner = null;
    }

    /**
     * Init this instance.
     *
     * This will iterate over all channels and check whether all versions have been merged.
     * If not it will merge the unmerged versions.
     *
     * Note: This has to be called after the one instance is initialized.
     */
    public async init(defaultOwner?: SHA256IdHash<Person>): Promise<void> {
        // Set the default owner the the instance owner if it was not specified.
        if (defaultOwner) {
            this.defaultOwner = defaultOwner;
        } else {
            const instanceOwner = getInstanceOwnerIdHash();
            if (!instanceOwner) {
                throw new Error('The instance does not have an owner. Is it initialized?');
            }
            this.defaultOwner = instanceOwner;
        }

        // Create the initial registry if it doesn't exist.
        await ChannelManager.getOrCreateChannelRegistry();

        // Merge new versions of channels that haven't been merged, yet.
        await this.checkMergeVersionsOfChannels();

        // Register event handlers
        onVersionedObj.addListener(this.boundOnVersionedObjHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        onVersionedObj.removeListener(this.boundOnVersionedObjHandler);
        this.defaultOwner = null;
    }

    // ######## Channel management ########

    /**
     * Create a new channel.
     *
     * @param {string} channelId - The id of the channel. See class description for more details on how ids and channels are handled.
     */
    public async createChannel(channelId: string): Promise<void> {
        logWithId_Debug(channelId, this.defaultOwner, `createChannel`);

        // Get the ChannelInfo from the database
        try {
            const channelInfoIdHash = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: channelId,
                owner: this.defaultOwner
            });

            await getObjectByIdHash<ChannelInfo>(channelInfoIdHash);
            logWithId(channelId, this.defaultOwner, `createChannel: Existed`);

            // Create a new one if getting it failed
        } catch (ignore) {
            await createSingleObjectThroughPurePlan(
                {module: '@module/createChannel'},
                channelId,
                this.defaultOwner
            );

            logWithId(channelId, this.defaultOwner, `createChannel: Created`);
            this.emit('updated');
        }
    }

    // ######## Put data into the channel ########

    /**
     * Post a new object to a channel.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {OneUnversionedObjectTypes} data - The object to post to the channel
     * @param {SHA256IdHash<Person>} owner
     */
    public async postToChannel<T extends OneUnversionedObjectTypes>(
        channelId: string,
        data: T,
        owner?: SHA256IdHash<Person>
    ): Promise<void> {
        if (!this.defaultOwner) {
            throw new Error('Default owner is not initialized');
        }
        if (!owner) {
            owner = this.defaultOwner;
        }

        logWithId(channelId, owner, `postToChannel`);
        await serializeWithType('ChannelManagerPost', async () => {
            await createSingleObjectThroughImpurePlan(
                {module: '@module/postToChannel'},
                channelId,
                owner,
                data
            );
        });
    }

    /**
     * Post a new object to a channel but only if it was not already postet to the channel
     *
     * Note: This will iterate over the whole tree if the object does not exist, so it might
     *       be slow.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {OneUnversionedObjectTypes} data - The object to post to the channel
     * @param {SHA256IdHash<Person>} owner
     */
    public async postToChannelIfNotExist<T extends OneUnversionedObjectTypes>(
        channelId: string,
        data: T,
        owner?: SHA256IdHash<Person>
    ): Promise<void> {
        await serializeWithType('ChannelManagerPostIfNotExist', async () => {
            // Iterate over the channel to see whether the object exists.
            const dataHash = await calculateHashOfObj(data);

            for await (const item of this.objectIterator(channelId, {
                owner: owner ? owner : this.defaultOwner
            })) {
                if ((await calculateHashOfObj(item.data)) === dataHash) {
                    return;
                }
            }

            // Post if above for loop didn't find the item (if it did, it returned)
            await this.postToChannel(channelId, data, owner);
        });
    }

    // ######## Get data from the channel ########

    public async *objectIterator(
        channelId: string,
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        const channels =
            queryOptions === undefined || queryOptions.owner === undefined
                ? await this.findChannelsForSpecificId(channelId)
                : [
                      await getObjectByIdObj({
                          $type$: 'ChannelInfo',
                          id: channelId,
                          owner: queryOptions.owner
                      })
                  ];

        const iterators = channels.map((channel: VersionedObjectResult<ChannelInfo>) => {
            return this.singleChannelIterator(channel.obj.id, {
                ...queryOptions,
                owner: channel.obj.owner
            });
        });

        for await (const obj of ChannelManager.runIterators(iterators, {...queryOptions})) {
            yield obj;
        }
    }

    /**
     * !!! Main Iterator
     * Create an iterator that iterates over all items in a channel from future to past.
     *
     * @param {string} channelId - The channel for which to create the iterator
     * @param {QueryOptions} queryOptions
     * @param {SHA256Hash<ChannelInfo>} channelHash
     */
    public async *singleChannelIterator(
        channelId: string,
        queryOptions: QueryOptions,
        channelHash?: SHA256Hash<ChannelInfo>
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        let objectsCount = 0;

        // Get the corresponding channel info object
        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: channelId,
            owner: queryOptions.owner
        });
        // if a channelHash is provided, get this specific channel info, otherwise get the latest by the idHash
        // this flow is only called within the getObjectsByHash function
        const channelInfo = channelHash
            ? await getObject(channelHash)
            : (await getObjectByIdHash<ChannelInfo>(channelInfoIdHash)).obj;
        let channelEntryHash = channelInfo.head;

        // Iterate over the whole list and append it to the output array
        while (channelEntryHash) {
            // Forward channelEntryHash to next element in chain
            // eslint-disable-next-line no-await-in-loop
            const channelEntry = await getObject<ChannelEntry>(channelEntryHash);
            channelEntryHash = channelEntry.previous;

            // Extract the data of current element
            // eslint-disable-next-line no-await-in-loop
            const creationTime: CreationTime = await getObject<CreationTime>(channelEntry.data);
            // eslint-disable-next-line no-await-in-loop
            const channelAccessLink = await getAllValues(channelInfoIdHash, true, 'IdAccess');

            if (
                queryOptions.to !== undefined &&
                creationTime.timestamp > queryOptions.to.getTime()
            ) {
                continue;
            }

            if (
                queryOptions.from !== undefined &&
                creationTime.timestamp < queryOptions.from.getTime()
            ) {
                break;
            }

            if (queryOptions.count !== undefined && objectsCount >= queryOptions.count) {
                break;
            }

            const persons: SHA256IdHash<Person>[] = (
                await Promise.all(
                    channelAccessLink.map(async (value: ReverseMapEntry<IdAccess>) => {
                        const accessObject = await getObjectWithType(value.toHash, 'IdAccess');
                        let allSharedPersons: SHA256IdHash<Person>[] = [];
                        if (accessObject.group.length > 0) {
                            const groupPersons = await Promise.all(
                                accessObject.group.map(async groupId => {
                                    const groupObject = await getObjectByIdHash(groupId);
                                    return groupObject.obj.person;
                                })
                            );
                            allSharedPersons = allSharedPersons.concat(
                                groupPersons.reduce(
                                    (acc: SHA256IdHash<Person>[], val: SHA256IdHash<Person>[]) =>
                                        acc.concat(val),
                                    []
                                )
                            );
                        }

                        if (accessObject.person.length > 0) {
                            allSharedPersons = allSharedPersons.concat(accessObject.person);
                        }
                        return allSharedPersons;
                    })
                )
            ).reduce(
                (acc: SHA256IdHash<Person>[], val: SHA256IdHash<Person>[]) => acc.concat(val),
                []
            );

            // eslint-disable-next-line no-await-in-loop
            const data = await getObject(creationTime.data);
            const obj = <ObjectData<OneUnversionedObjectTypes>>{
                date: new Date(creationTime.timestamp),
                id: creationTime.data,
                data: data,
                author: this.defaultOwner,
                sharedWith: Array.from([...new Set(persons)])
            };

            objectsCount++;
            yield obj;
        }
    }

    /**
     *
     * @param {string} channelId - The channel for which to create the iterator
     * @param {T} type - The type of the elements to iterate
     */
    public async *objectIteratorWithType<T extends OneUnversionedObjectTypeNames>(
        channelId: string,
        type: T
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectInterfaces[T]>> {
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        for await (const obj of this.objectIterator(channelId)) {
            if (hasRequestedType(obj)) {
                yield obj;
            }
        }
    }

    /**
     * Get all data from a channel.
     *
     * In Ascending order! (TODO: add a switch for that)
     * // if owner === undefined , get all the channelInfos with the channelId
     * @param {string} channelId - The id of the channel to read from
     * @param {QueryOptions} queryOptions
     */
    public async getObjects(
        channelId: string,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        const objects: ObjectData<OneUnversionedObjectTypes>[] = [];
        if (queryOptions !== undefined && queryOptions.owner !== undefined) {
            for await (const obj of this.singleChannelIterator(channelId, queryOptions)) {
                objects.push(obj);
            }
            return objects.reverse();
        } else {
            for await (const obj of this.objectIterator(channelId, {
                ...queryOptions
            })) {
                objects.push(obj);
            }
            return objects.reverse();
        }
    }

    /**
     * iterate over a specific channel by hash
     * @param {SHA256Hash<ChannelInfo>} channelHash
     * @param {QueryOptions} queryOptions
     * @return {Promise<ObjectData<OneUnversionedObjectTypes>[]>}
     */
    public async getObjectsByHash(
        channelHash: SHA256Hash<ChannelInfo>,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        const objects: ObjectData<OneUnversionedObjectTypes>[] = [];
        const channel = await getObject(channelHash);
        for await (const obj of this.singleChannelIterator(
            channel.id,
            {owner: channel.owner},
            channelHash
        )) {
            objects.push(obj);
        }
        return objects.reverse();
    }

    /**
     * Get all data from a channel.
     *
     * In Ascending order! (TODO: add a switch for that)
     *
     * @param {string}  channelId - The id of the channel to read from
     * @param {T}       type - Type of objects to retrieve. If type does not match the object is skipped.
     * @param {QueryOptions} queryOptions
     */
    public async getObjectsWithType<T extends OneUnversionedObjectTypeNames>(
        channelId: string,
        type: T,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectInterfaces[T]>[]> {
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        const objects: ObjectData<OneUnversionedObjectInterfaces[T]>[] = [];

        if (queryOptions !== undefined && queryOptions.owner !== undefined) {
            for await (const obj of this.singleChannelIterator(channelId, queryOptions)) {
                if (hasRequestedType(obj)) {
                    objects.push(obj);
                }
            }
            return objects.reverse();
        } else {
            for await (const obj of this.objectIterator(channelId, {
                ...queryOptions
            })) {
                if (hasRequestedType(obj)) {
                    objects.push(obj);
                }
            }
            return objects.reverse();
        }
    }

    /**
     * Obtain a specific object from a channel.
     *
     * This is a very inefficient implementation, because it iterates over the chain.
     * In the future it would be better to just pick the object with the passed hash.
     * But this only works when we have working reverse maps for getting the metadata.
     * The other option would be to use the hash of the indexed metadata as id, then
     * we don't have the reverse map problem.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {string} id - id of the object to extract, usually this is a hash of the
     *                      object itself or a related object.
     * @param {QueryOptions} queryOptions
     */
    public async getObjectById(
        channelId: string,
        id: string,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        const objects: ObjectData<OneUnversionedObjectTypes>[] = [];

        if (queryOptions !== undefined && queryOptions.owner !== undefined) {
            for await (const obj of this.singleChannelIterator(channelId, queryOptions)) {
                if (obj.id === id) {
                    objects.push(obj);
                }
            }
            if (objects.length === 0) {
                throw Error('Object not found in current chain');
            }

            return objects.reverse();
        } else {
            for await (const obj of this.objectIterator(channelId, {
                ...queryOptions
            })) {
                if (obj.id === id) {
                    objects.push(obj);
                }
            }
            if (objects.length === 0) {
                throw Error('Object not found in current chain');
            }

            return objects.reverse();
        }
    }

    /**
     * Obtain a specific object from a channel.
     *
     * This is a very inefficient implementation, because it iterates over the chain.
     * In the future it would be better to just pick the object with the passed hash.
     * But this only works when we have working reverse maps for getting the metadata.
     * The other option would be to use the hash of the indexed metadata as id, then
     * we don't have the reverse map problem.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {string} id - id of the object to extract, usually this is a hash of the
     *                      object itself or a related object.
     * @param {T}      type - Type of objects to retrieve. If type does not match an
     *                        error is thrown.
     * @param {QueryOptions} queryOptions
     *
     */
    public async getObjectWithTypeById<T extends OneUnversionedObjectTypeNames>(
        channelId: string,
        id: string,
        type: T,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectInterfaces[T]>[]> {
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        const objects: ObjectData<OneUnversionedObjectInterfaces[T]>[] = [];

        if (queryOptions !== undefined && queryOptions.owner !== undefined) {
            for await (const obj of this.singleChannelIterator(channelId, queryOptions)) {
                if (hasRequestedType(obj) && obj.id === id) {
                    objects.push(obj);
                }
            }
            return objects.reverse();
        } else {
            for await (const obj of this.objectIterator(channelId, {
                ...queryOptions
            })) {
                if (hasRequestedType(obj) && obj.id === id) {
                    objects.push(obj);
                }
            }
            return objects.reverse();
        }
    }

    /**
     *
     * @param {string} channelId
     * @param {string} to - group name
     */
    public async giveAccessToChannelInfo(
        channelId: string,
        to?: string
    ): Promise<
        VersionedObjectResult<Access | IdAccess> | VersionedObjectResult<Access | IdAccess>[]
    > {
        const channels = await this.findChannelsForSpecificId(channelId);

        if (to === undefined) {
            const accessChannels = await Promise.all(
                channels.map(async (channel: VersionedObjectResult<ChannelInfo>) => {
                    return {
                        id: channel.idHash,
                        person: [this.defaultOwner],
                        group: [],
                        mode: SET_ACCESS_MODE.REPLACE
                    };
                })
            );
            return await createManyObjectsThroughPurePlan(
                {
                    module: '@one/access',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                accessChannels
            );
        }

        const group = await this.accessModel.getAccessGroupByName(to);

        const accessObjects = await Promise.all(
            channels.map(async (channel: VersionedObjectResult<ChannelInfo>) => {
                return {
                    id: channel.idHash,
                    person: [],
                    group: [group.idHash],
                    mode: SET_ACCESS_MODE.REPLACE
                };
            })
        );

        return await createManyObjectsThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            accessObjects
        );
    }

    /**
     * Retrieve all channels registered at the channel registry
     *
     * @param channelId
     * @param {SHA256IdHash<Person>} owner
     * @returns {Promise<ChannelInformation[]>}
     */
    public async channels(
        channelId?: string,
        owner?: SHA256IdHash<Person>
    ): Promise<ChannelInformation[]> {
        if (channelId === undefined) {
            const channelRegistry = Array.from(
                (await ChannelManager.getOrCreateChannelRegistry()).obj.channels.keys()
            );
            return await Promise.all(
                channelRegistry.map(async (channelInfoIdHash: SHA256IdHash<ChannelInfo>) => {
                    return {hash: await getHashByIdHash(channelInfoIdHash)};
                })
            );
        }
        if (owner === undefined) {
            return (await this.findChannelsForSpecificId(channelId)).map(
                (channelInfo: VersionedObjectResult<ChannelInfo>) => ({
                    hash: channelInfo.hash
                })
            );
        } else {
            return [
                await getObjectByIdObj({$type$: 'ChannelInfo', id: channelId, owner: owner})
            ].map((channelInfo: VersionedObjectResult<ChannelInfo>) => ({
                hash: channelInfo.hash
            }));
        }
    }

    /**
     * @BETA Second implementation of the merging algorithm
     * @param {SHA256Hash<ChannelInfo>} firstChannel
     * @param {SHA256Hash<ChannelInfo>} secondChannel
     * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
     */
    private static async mergeChannels(
        firstChannel: SHA256Hash<ChannelInfo>,
        secondChannel: SHA256Hash<ChannelInfo>
    ): Promise<VersionedObjectResult<ChannelInfo>> {
        const firstChannelUnversionedObject = await getObject(firstChannel);
        const secondChannelUnversionedObject = await getObject(secondChannel);

        let sortedChannelEntries: ChannelEntry[] = [];

        if (
            firstChannelUnversionedObject.id !== secondChannelUnversionedObject.id &&
            firstChannelUnversionedObject.owner !== secondChannelUnversionedObject.owner
        ) {
            throw new Error('Error: in order to merge the channels they must be the same');
        }

        if (firstChannelUnversionedObject.head === undefined) {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                secondChannelUnversionedObject
            );
        }

        if (secondChannelUnversionedObject.head === undefined) {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                firstChannelUnversionedObject
            );
        }

        let firstChannelHead = await getObject(firstChannelUnversionedObject.head);
        let secondChannelHead = await getObject(secondChannelUnversionedObject.head);
        let firstChannelHash = firstChannelUnversionedObject.head;
        let secondChannelHash = secondChannelUnversionedObject.head;

        for (;;) {
            const firstChannelCreationTime = await getObject(firstChannelHead.data);
            const secondChannelCreationTime = await getObject(secondChannelHead.data);

            if (firstChannelHash === secondChannelHash) {
                return await ChannelManager.reBuildChannelChain(
                    sortedChannelEntries.reverse(),
                    firstChannelHash,
                    firstChannelUnversionedObject
                );
            }

            if (firstChannelCreationTime.timestamp >= secondChannelCreationTime.timestamp) {
                sortedChannelEntries.push(firstChannelHead);
                if (firstChannelHead.previous === undefined) {
                    return await ChannelManager.reBuildChannelChain(
                        sortedChannelEntries.reverse(),
                        secondChannelHash,
                        firstChannelUnversionedObject
                    );
                }

                firstChannelHash = firstChannelHead.previous;
                firstChannelHead = await getObject(firstChannelHead.previous);
                continue;
            }

            if (firstChannelCreationTime.timestamp < secondChannelCreationTime.timestamp) {
                sortedChannelEntries.push(secondChannelHead);
                if (secondChannelHead.previous === undefined) {
                    return await ChannelManager.reBuildChannelChain(
                        sortedChannelEntries.reverse(),
                        firstChannelHash,
                        firstChannelUnversionedObject
                    );
                }

                secondChannelHash = secondChannelHead.previous;
                secondChannelHead = await getObject(secondChannelHead.previous);
            }
        }
    }

    /**
     * @description Creates a ChannelInfo from a given ChannelEntry List and a root
     * @param {ChannelEntry[]} entriesToBeAdded
     * @param {SHA256Hash<ChannelEntry> | undefined} startingEntry
     * @param {ChannelInfo} mainChannelInfo
     * @returns {Promise<VersionedObjectResult<ChannelInfo>> }
     */
    private static async reBuildChannelChain(
        entriesToBeAdded: ChannelEntry[],
        startingEntry: SHA256Hash<ChannelEntry> | undefined,
        mainChannelInfo: ChannelInfo
    ): Promise<VersionedObjectResult<ChannelInfo>> {
        let lastChannelEntry;
        for (let i = 0; i < entriesToBeAdded.length; i++) {
            lastChannelEntry = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'ChannelEntry',
                    data: entriesToBeAdded[i].data,
                    previous:
                        i === 0 ? startingEntry : await calculateHashOfObj(entriesToBeAdded[i - 1])
                }
            );
        }

        return await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'ChannelInfo',
                id: mainChannelInfo.id,
                owner: mainChannelInfo.owner,
                head: lastChannelEntry === undefined ? startingEntry : lastChannelEntry.hash
            }
        );
    }

    /**
     * @description checks for merging problems and then updates the registry
     * @param {SHA256IdHash<ChannelInfo>} channelIdHash
     * @param {SHA256Hash<ChannelInfo>} channelHash
     * @returns {Promise<void>}
     */
    private static async updateChannelRegistryMap(
        channelIdHash: SHA256IdHash<ChannelInfo>,
        channelHash: SHA256Hash<ChannelInfo>
    ): Promise<void> {
        let channelFromMap: SHA256Hash<ChannelInfo> | undefined = (
            await ChannelManager.getOrCreateChannelRegistry()
        ).obj.channels.get(channelIdHash);

        if (channelFromMap === undefined) {
            await ChannelManager.addChannelToTheChannelRegistry(channelIdHash, channelHash);
            channelFromMap = channelHash;
        }

        if (channelHash === channelFromMap) {
            return;
        }

        let index = -1;
        let previousChannelHash: SHA256Hash<ChannelInfo> = await getNthVersionMapHash(
            channelIdHash,
            index
        );
        const unMergedChannelHashes: SHA256Hash<ChannelInfo>[] = [];

        while (previousChannelHash !== undefined) {
            if (previousChannelHash === channelFromMap) {
                break;
            }
            unMergedChannelHashes.push(previousChannelHash);
            previousChannelHash = await getNthVersionMapHash(channelIdHash, --index);
        }

        let latestMergedHash: SHA256Hash<ChannelInfo> = channelHash;

        for (const hash of unMergedChannelHashes) {
            const mergedChannel = await ChannelManager.mergeChannels(hash, latestMergedHash);
            // not do this, instead sgtore it in a local variable ( the hash )
            latestMergedHash = mergedChannel.hash;
        }

        if (latestMergedHash !== undefined)
            await ChannelManager.addChannelToTheChannelRegistry(channelIdHash, latestMergedHash);
    }

    /**
     * @description Yield values from the iterators
     * @param iterators
     * @param queryOptions
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>}
     */
    private static async *runIterators(
        iterators: AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>[],
        queryOptions: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        let currentValues: ObjectData<OneUnversionedObjectTypes>[] = [];
        let count = 0;

        for (const iterator of iterators) {
            currentValues.push((await iterator.next()).value);
        }

        if (currentValues.length === 1) {
            if (currentValues[0] !== undefined) {
                yield currentValues[0];
            }
            for (;;) {
                const yieldedValue = (await iterators[0].next()).value;
                if (yieldedValue !== undefined) {
                    yield yieldedValue;
                } else {
                    break;
                }
            }
            return;
        }

        for (;;) {
            // determine the largest element in currentValues
            let maxIndex = -1;
            let maxValue = -1;

            let selectedItem: ObjectData<OneUnversionedObjectTypes> | undefined = undefined;

            for (let i = 0; i < currentValues.length; i++) {
                // @ts-ignore
                if (currentValues[i] !== undefined && currentValues[i].date > maxValue) {
                    // @ts-ignore
                    maxValue = currentValues[i].date;
                    maxIndex = i;
                    selectedItem = currentValues[i];
                }
            }

            if (maxIndex === -1 || selectedItem === undefined) {
                break;
            }

            if (queryOptions !== undefined && queryOptions.count !== undefined) {
                if (count === queryOptions.count) {
                    break;
                }
            }

            currentValues[maxIndex] = (await iterators[maxIndex].next()).value;
            ++count;
            yield selectedItem;
        }
    }

    private async getExplodedChannelInfosFromRegistry(): Promise<
        VersionedObjectResult<ChannelInfo>[]
    > {
        const channelRegistry = Array.from(
            (await ChannelManager.getOrCreateChannelRegistry()).obj.channels.keys()
        );
        return await Promise.all(
            channelRegistry.map(async (channelInfoIdHash: SHA256IdHash<ChannelInfo>) => {
                return await getObjectByIdHash(channelInfoIdHash);
            })
        );
    }

    private async findChannelsForSpecificId(
        channelId: string
    ): Promise<VersionedObjectResult<ChannelInfo>[]> {
        return (await this.getExplodedChannelInfosFromRegistry()).filter(
            (channelInfo: VersionedObjectResult<ChannelInfo>) => channelInfo.obj.id === channelId
        );
    }

    private async checkMergeVersionsOfChannels(): Promise<void> {
        await serializeWithType('ChannelRegistryMerging', async () => {
            const channelRegistry = Array.from(
                (await ChannelManager.getOrCreateChannelRegistry()).obj.channels.keys()
            );
            for (const channelIdHash of channelRegistry) {
                const object = await getObjectByIdHash(channelIdHash);
                await ChannelManager.updateChannelRegistryMap(channelIdHash, object.hash);
            }
        });
    }

    /**
     * Handler function for the VersionedObj
     * @param {VersionedObjectResult} caughtObject
     * @return {Promise<void>}
     */
    private async handleOnVersionedObj(caughtObject: VersionedObjectResult): Promise<void> {
        if (isChannelInfoResult(caughtObject)) {
            await serializeWithType('ChannelRegistryMerging', async () => {
                await ChannelManager.updateChannelRegistryMap(
                    caughtObject.idHash,
                    caughtObject.hash
                );
            });
            this.emit('updated', caughtObject.obj.id);
        }
    }

    /**
     *
     * @param {SHA256IdHash<ChannelInfo>} channelIdHash
     * @param {SHA256Hash<ChannelInfo>} channelHash
     * @returns {Promise<void>}
     */
    private static async addChannelToTheChannelRegistry(
        channelIdHash: SHA256IdHash<ChannelInfo>,
        channelHash: SHA256Hash<ChannelInfo>
    ): Promise<VersionedObjectResult<ChannelRegistry>> {
        const channelRegistry = await ChannelManager.getOrCreateChannelRegistry();
        channelRegistry.obj.channels.set(channelIdHash, channelHash);

        return await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            channelRegistry.obj
        );
    }

    /**
     * Gets the channel registry.
     *
     * If it doesn't exist, it is created.
     *
     * @returns {Promise<VersionedObjectResult<ChannelRegistry>>} The registry
     */
    static async getOrCreateChannelRegistry(): Promise<VersionedObjectResult<ChannelRegistry>> {
        return await serializeWithType('ChannelRegistry', async () => {
            try {
                //@ts-ignore
                return await getObjectByIdObj({$type$: 'ChannelRegistry', id: 'ChannelRegistry'});
            } catch (e) {
                return await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    {
                        $type$: 'ChannelRegistry',
                        id: 'ChannelRegistry',
                        channels: new Map()
                    }
                );
            }
        });
    }
}
