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
    Access,
    ChannelRegistryEntry,
    UnversionedObjectResult
} from '@OneCoreTypes';
import {
    createManyObjectsThroughPurePlan,
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getAllVersionMapEntries,
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
import {ensureHash, ensureIdHash} from 'one.core/lib/util/type-checks';
import {OEvent} from '../misc/OEvent';

const MessageBus = createMessageBus('ChannelManager');

/**
 * Logs a channel manager message.
 *
 * @param {string} channelId
 * @param {SHA256IdHash<Person>} owner
 * @param {string} message
 */
function logWithId(channelId: string | null, owner: SHA256IdHash<Person> | null, message: string) {
    MessageBus.send('log', `${channelId} # ${owner} # ${message}`);
}

/**
 * Logs a channel manager message.
 *
 * @param {string} channelId
 * @param {SHA256IdHash<Person>} owner
 * @param {string} message
 */
function logWithId_Debug(
    channelId: string | null,
    owner: SHA256IdHash<Person> | null,
    message: string
) {
    MessageBus.send('debug', `${channelId} # ${owner} # ${message}`);
}

/**
 * This represents a document but not the content,
 */
export type Channel = {
    id: string;
    owner: SHA256IdHash<Person>;
};

/**
 *  This represents the possible orders of sorting the returned data from the channel.
 */
export enum Order {
    Ascending = 1,
    Descending = 2
}

/**
 * Options used for selecting a specific channel
 *
 * Owners and channelIds must match in order to be returned. So if you specify one owner and one channelId you
 * will get one channel. If you specify two owners and two channelIds you get up to four channels (all combinations
 * of owner / channelId - if a corresponding channel exists)
 *
 * The other stuff is additive, so if you specify one 'channel' and one 'channelInfoHash' you will get two entries.
 *
 * If an element is missing, this means that all of them should be queried.
 */
export type ChannelSelectionOptions = {
    channelId?: string; // Query channels that have this id
    channelIds?: string[]; // Query channels that have one of these ids.
    owner?: SHA256IdHash<Person>; // Query channels that have this owner.
    owners?: SHA256IdHash<Person>[]; // Query channels that have one of these owners.
    channel?: Channel; // Query this channel
    channels?: Channel[]; // Query these channels

    // Usually you don't need these. Only certain debug features use these or it is used internally
    id?: string; // Exact id of the object to get (you can get it from ObjectData.id)
    ids?: string[]; // Exact ids of the objects to get (you can get it from ObjectData.id)
    channelInfoHash?: SHA256Hash<ChannelInfo>; // Query exactly this channel version
    channelInfoHashes?: SHA256Hash<ChannelInfo>[]; // Query exactly these channel versions
    channelInfoIdHash?: SHA256IdHash<ChannelInfo>; // Query this channel
    channelInfoIdHashes?: SHA256IdHash<ChannelInfo>[]; // Query these channels
};

/**
 * Options used for selecting specific data from channels.
 *
 * All elements are ANDed together.
 */
export type DataSelectionOptions = {
    orderBy?: Order; // Order of the data. Descending is default and is more memory efficient.
    from?: Date; // Query items that happen after this date
    to?: Date; // Query items that happen before this date
    count?: number; // Query this number of items
    id?: string; // Exact id of the object to get (you can get it from ObjectData.id)
    ids?: string[]; // Exact ids of the objects to get (you can get it from ObjectData.id)
    type?: OneUnversionedObjectTypeNames; // The type of objects you want to receive.
    types?: OneUnversionedObjectTypeNames[]; // The types of objects you want to receive.
    omitData?: boolean; // omit the data field if set to true
};

/**
 * Type defines the query options that can be specified while retrieving data from the channel.
 */
export type QueryOptions = ChannelSelectionOptions & DataSelectionOptions;

/**
 * Type stores the metadata and the data for a query result.
 */
export type ObjectData<T> = {
    channelId: string; // The channel id
    channelOwner: SHA256IdHash<Person>; // The owner of the channel
    channelEntryHash: SHA256Hash<ChannelEntry>; // The reference to the channel entry object

    id: string; // This id identifies the data point. It can be used to reference this data point in other methods of this class.
    creationTime: Date; // Time when this data point was created
    author: SHA256IdHash<Person>; // Author of this data point (currently, this is always the owner)
    sharedWith: SHA256IdHash<Person>[]; // Who has access to this data

    data: T; // The data
    dataHash: SHA256Hash<OneUnversionedObjectTypes>; // The hash of the data
};

/**
 * This type is returned by the raw channel iterator
 */
export type RawChannelEntry = {
    channelInfo: ChannelInfo;
    channelInfoIdHash: SHA256IdHash<ChannelInfo>;
    channelEntryHash: SHA256Hash<ChannelEntry>;
    creationTimeHash: SHA256Hash<CreationTime>;
    creationTime: number;
    dataHash: SHA256Hash<OneUnversionedObjectTypes>;
};

/**
 * This are the entries of the ChannelInfoCache.
 */
type ChannelInfoCacheEntry = {
    latestMergedVersionIndex: number; // The versions in the version-map from 0 to this value have been merged
    readVersion: ChannelInfo; // This is the latest version generated by the merge algorithm suitable for reading
    readVersionIndex: number; // This is the index in the version-map of the readVersion
    mergedHandlers: (() => void)[]; // Handlers that are notified if the version was merged
};

/**
 * Assert that passed object has ChannelInfoResult type.
 *
 * This is required so that typescript stops displaying errors.
 *
 * @param {VersionedObjectResult} versionedObjectResult - the one object
 * @returns {VersionedObjectResult<ChannelInfo>} The same object, just casted in a safe way
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
 * A channel is a list of objects stored as merkle-tree indexed by time.
 * The list is sorted by creation time so that it can be distributed and merged.
 *
 * Each channel is identified by a channelId (just a string) and the owner.
 * In a distributed network only the owner can create channels.
 * TODO: explain more about access rights and distribution and everything!
 *
 * The structure is as follows:
 * TODO: add PlantUml graph here
 *
 * NOTE: This class manages one global one object called ChannelRegistry
 *       It therefore does not make sense to have multiple ChannelManager objects.
 *       We don't use a singleton, because it makes it harder to track where
 *       channels are used.
 */
export default class ChannelManager extends EventEmitter {
    /**
     * This event is emitted for each channel that has new data. The emitted event value has the (channelId,
     * channelOwner) pair.
     */
    public onUpdated = new OEvent<
        (channelId: string, channelOwner: SHA256IdHash<Person>) => void
    >();

    private channelInfoCache: Map<SHA256IdHash<ChannelInfo>, ChannelInfoCacheEntry>;

    // Serialize locks
    private readonly postLockName = 'ChannelManager_postLock';
    private readonly postNELockName = 'ChannelManager_postNELock';
    private readonly cacheLockName = 'ChannelManager_cacheLock_';
    private readonly registryLockName = 'ChannelManager_registryLock';

    // Default owner for post calls
    private defaultOwner: SHA256IdHash<Person> | null;
    private accessModel: AccessModel;
    private readonly boundOnVersionedObjHandler: (
        caughtObject: VersionedObjectResult
    ) => Promise<void>;

    /**
     * Create the channel manager instance.
     *
     * @param {AccessModel} accessModel
     */
    constructor(accessModel: AccessModel) {
        super();
        this.accessModel = accessModel;
        this.boundOnVersionedObjHandler = this.handleOnVersionedObj.bind(this);
        this.defaultOwner = null;
        this.channelInfoCache = new Map<SHA256IdHash<ChannelInfo>, ChannelInfoCacheEntry>();
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

        // Load the cache from the registry
        await this.loadRegistryCacheFromOne();

        // Register event handlers
        onVersionedObj.addListener(this.boundOnVersionedObjHandler);

        // Merge new versions of channels that haven't been merged, yet.
        await this.mergeAllUnmergedChannelVersions();
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        onVersionedObj.removeListener(this.boundOnVersionedObjHandler);
        this.defaultOwner = null;
        this.channelInfoCache = new Map<SHA256IdHash<ChannelInfo>, ChannelInfoCacheEntry>();
    }

    // ######## Channel management ########

    /**
     * Create a new channel.
     *
     * If the channel already exists, this call is a noop.
     *
     * @param {string} channelId - The id of the channel. See class description for more details on how ids and channels are handled.
     * @param {SHA256IdHash<Person>} owner - The id hash of the person that should be the owner of this channel.
     */
    public async createChannel(channelId: string, owner?: SHA256IdHash<Person>): Promise<void> {
        if (!this.defaultOwner) {
            throw Error('Not initialized');
        }
        if (!owner) {
            owner = this.defaultOwner;
        }

        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: channelId,
            owner: owner
        });

        logWithId(channelId, owner, `createChannel - START`);

        try {
            await getObjectByIdHash<ChannelInfo>(channelInfoIdHash);
            logWithId(channelId, owner, `createChannel - END: Existed`);
        } catch (ignore) {
            // Create a new one if getting it failed
            await createSingleObjectThroughPurePlan(
                {module: '@module/channelCreate'},
                channelId,
                owner
            );

            // Create the cache entry.
            // We cannot wait for the hook to make the entry, because following posts
            // might be faster than the hook, so let's add the channel explicitly to
            // the registry
            await this.addChannelIfNotExist(channelInfoIdHash);

            logWithId(channelId, owner, `createChannel - END: Created`);
        }
    }

    /**
     * Retrieve all channels registered at the channel registry
     *
     * @param {ChannelSelectionOptions} options
     * @returns {Promise<Channel[]>}
     */
    public async channels(options?: ChannelSelectionOptions): Promise<Channel[]> {
        const channelInfos = await this.getMatchingChannelInfos(options);
        return channelInfos.map(info => {
            return {id: info.id, owner: info.owner};
        });
    }

    // ######## Put data into the channel ########

    /**
     * Post a new object to a channel.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {OneUnversionedObjectTypes} data - The object to post to the channel
     * @param {SHA256IdHash<Person>} channelOwner
     * @param {number} timestamp
     */
    public async postToChannel<T extends OneUnversionedObjectTypes>(
        channelId: string,
        data: T,
        channelOwner?: SHA256IdHash<Person>,
        timestamp?: number
    ): Promise<void> {
        // Determine the owner to use for posting.
        // It is either the passed one, or the default one if none was passed.
        let owner: SHA256IdHash<Person>;
        if (channelOwner) {
            owner = channelOwner;
        } else {
            if (!this.defaultOwner) {
                throw new Error('Default owner is not initialized');
            }
            owner = this.defaultOwner;
        }

        // Post the data
        try {
            const channelInfoIdHash = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: channelId,
                owner: owner
            });

            let waitForMergePromise;
            await serializeWithType(`${this.cacheLockName}${channelInfoIdHash}`, async () => {
                // Setup the merge handler
                const cacheEntry = this.channelInfoCache.get(channelInfoIdHash);
                if (!cacheEntry) {
                    throw new Error('This channel does not exist, you cannot post to it.');
                }

                // Create the promise on which we wait after we posted the value to one
                waitForMergePromise = new Promise(resolve => {
                    cacheEntry.mergedHandlers.push(resolve);
                });

                // Post the data
                await serializeWithType(this.postLockName, async () => {
                    logWithId(channelId, owner, `postToChannel - START`);

                    await createSingleObjectThroughImpurePlan(
                        {module: '@module/channelPost'},
                        channelId,
                        owner,
                        data,
                        timestamp
                    );

                    logWithId(channelId, owner, `postToChannel - END`);
                });
            });

            // Wait until the merge has completed before we resolve the promise
            if (waitForMergePromise) {
                await waitForMergePromise;
            }
        } catch (e) {
            logWithId(channelId, owner, 'postToChannel - FAIL: ' + e.toString());
            throw e;
        }
    }

    /**
     * Post a new object to a channel but only if it was not already posted to the channel
     *
     * Note: This will iterate over the whole tree if the object does not exist, so it might
     *       be slow.
     *
     * @param {string} channelId - The id of the channel to post to
     * @param {OneUnversionedObjectTypes} data - The object to post to the channel
     * @param {SHA256IdHash<Person>} channelOwner
     */
    public async postToChannelIfNotExist<T extends OneUnversionedObjectTypes>(
        channelId: string,
        data: T,
        channelOwner?: SHA256IdHash<Person>
    ): Promise<void> {
        // Determine the owner to use for posting.
        // It is either the passed one, or the default one if none was passed.
        let owner: SHA256IdHash<Person>;
        if (channelOwner) {
            owner = channelOwner;
        } else {
            if (!this.defaultOwner) {
                throw new Error('Default owner is not initialized');
            }
            owner = this.defaultOwner;
        }

        try {
            // We need to serialize here, because two posts of the same item must be serialized
            // in order for the second one to wait until the first one was inserted.
            await serializeWithType(this.postNELockName, async () => {
                logWithId(channelId, owner, `postToChannelIfNotExist - START`);

                // Calculate the hash of the passed object. We will compare it with existing entries
                const dataHash = await calculateHashOfObj(data);

                // Iterate over the channel to see whether the object exists.
                let exists = false;
                for await (const item of this.objectIterator({channelId, owner})) {
                    if (item.dataHash === dataHash) {
                        exists = true;
                    }
                }

                // Post only if it does not exist
                if (exists) {
                    logWithId(channelId, owner, `postToChannelIfNotExist - END: existed`);
                } else {
                    await this.postToChannel(channelId, data, owner);
                    logWithId(channelId, owner, `postToChannelIfNotExist - END: posted`);
                }
            });
        } catch (e) {
            logWithId(channelId, owner, 'postToChannelIfNotExist - FAIL: ' + e.toString());
            throw e;
        }
    }

    // ######## Get data from channels - Array based ########

    /**
     * Get all data from one or multiple channels.
     *
     * Note the behavior when using ascending ordering (default) and count.
     * It will return the 'count' latest elements in ascending order, not the
     * 'count' oldest elements. It is counter intuitive and should either
     * be fixed or the iterator interface should be the mandatory
     *
     * @param {QueryOptions} queryOptions
     */
    public async getObjects(
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        // Use iterator interface to collect all objects
        const objects: ObjectData<OneUnversionedObjectTypes>[] = [];
        for await (const obj of this.objectIterator(queryOptions)) {
            objects.push(obj);
        }

        // Decide, whether to return it reversed, or not
        if (queryOptions && queryOptions.orderBy === Order.Descending) {
            return objects;
        } else {
            return objects.reverse();
        }
    }

    /**
     * Get all data from a channel.
     *
     * @param {T}       type - Type of objects to retrieve. If type does not match the object is skipped.
     * @param {QueryOptions} queryOptions
     */
    public async getObjectsWithType<T extends OneUnversionedObjectTypeNames>(
        type: T,
        queryOptions?: QueryOptions
    ): Promise<ObjectData<OneUnversionedObjectInterfaces[T]>[]> {
        // Use iterator interface to collect all objects
        const objects: ObjectData<OneUnversionedObjectInterfaces[T]>[] = [];
        for await (const obj of this.objectIteratorWithType(type, queryOptions)) {
            objects.push(obj);
        }

        // Decide, whether to return it reversed, or not
        if (queryOptions && queryOptions.orderBy === Order.Descending) {
            return objects;
        } else {
            return objects.reverse();
        }
    }

    /**
     * Obtain a specific object from a channel.
     *
     * @param {string} id - id of the object to extract
     */
    public async getObjectById(id: string): Promise<ObjectData<OneUnversionedObjectTypes>> {
        const obj = (await this.objectIterator({id}).next()).value;
        if (!obj) {
            throw new Error('The referenced object does not exist');
        }
        return obj;
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
     * @param {string} id - id of the object to extract
     * @param {T} type - Type of objects to retrieve. If type does not match an
     *                        error is thrown.
     * @returns {Promise<ObjectData<OneUnversionedObjectInterfaces[T]>>}
     */
    public async getObjectWithTypeById<T extends OneUnversionedObjectTypeNames>(
        id: string,
        type: T
    ): Promise<ObjectData<OneUnversionedObjectInterfaces[T]>> {
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        const obj = (await this.objectIterator({id}).next()).value;
        if (!obj) {
            throw new Error('The referenced object does not exist');
        }
        if (!hasRequestedType(obj)) {
            throw new Error(`The referenced object does not have the expected type ${type}`);
        }

        return obj;
    }

    /**
     * Obtain the latest merged ChannelInfoHash from the registry
     *
     * It is useful for ChannelSelectionOptions
     *
     * @param channel - the channel for which to get the channel info
     */
    public async getLatestMergedChannelInfoHash(
        channel: Channel
    ): Promise<SHA256Hash<ChannelInfo>> {
        const channelInfoIdHash = await calculateIdHashOfObj({$type$: 'ChannelInfo', ...channel});

        const channelEntry = this.channelInfoCache.get(channelInfoIdHash);

        if (!channelEntry) {
            throw new Error('The specified channel does not exist');
        }

        return await getNthVersionMapHash(channelInfoIdHash, channelEntry.readVersionIndex);
    }

    // ######## Get data from channels - ITERATORS ########

    /**
     * Iterate over all objects in the channels matching the query options.
     *
     * Note that the sort order is not supported. It is silently ignored.
     * Items are always returned in descending order regarding time.
     * It is a single linked list underneath, so no way of efficiently iterating
     * in the other direction.
     *
     * @param {QueryOptions} queryOptions
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>}
     */
    public async *objectIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        // The count needs to be dealt with at the top level, because it involves all returned items
        if (queryOptions && queryOptions.count) {
            let elementCounter = 0;

            // Iterate over the merge iterator and filter unwanted elements
            for await (const element of this.multiChannelObjectIterator(queryOptions)) {
                if (queryOptions.count !== undefined && elementCounter >= queryOptions.count) {
                    break;
                }

                ++elementCounter;
                yield element;
            }
        } else {
            yield* this.multiChannelObjectIterator(queryOptions);
        }
    }

    /**
     * Iterate over all objects in the channels matching the query options.
     *
     * This method also returns only the objects of a certain type.
     *
     * @param {T} type - The type of the elements to iterate
     * @param {QueryOptions} queryOptions
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectInterfaces[T]>>}
     */
    public async *objectIteratorWithType<T extends OneUnversionedObjectTypeNames>(
        type: T,
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectInterfaces[T]>> {
        if (queryOptions) {
            queryOptions.type = type;
        } else {
            queryOptions = {type};
        }

        // Iterate over all objects filtering out the ones with the wrong type
        yield* this.objectIterator(queryOptions) as AsyncIterableIterator<
            ObjectData<OneUnversionedObjectInterfaces[T]>
        >;
    }

    /**
     * Find the differences in the chain starting from the common history
     *
     * Note: this only works when both channel infos are from the same channel.
     *
     * @param nextChannel
     * @param currentChannel
     */
    public static async *differencesIteratorMostCurrent(
        nextChannel: SHA256Hash<ChannelInfo>,
        currentChannel: SHA256Hash<ChannelInfo>
    ): AsyncIterableIterator<RawChannelEntry> {
        const channelInfoNext = await getObject(nextChannel);
        const channelInfoCurrent = await getObject(currentChannel);
        const itNext = ChannelManager.singleChannelObjectIterator(channelInfoNext);
        const itCurrent = ChannelManager.singleChannelObjectIterator(channelInfoCurrent);

        if (!channelInfoNext.head) {
            yield* itCurrent;
        } else if (!channelInfoCurrent.head) {
            yield* itNext;
        } else {
            yield* ChannelManager.mergeIteratorMostCurrent([itNext, itCurrent], true, false, true);
        }
    }

    // ######## Get data from channels - ITERATORS PRIVATE ########

    /**
     * Iterate over all objects in the channels selected by the passed ChannelSelectionOptions.
     *
     * @param {QueryOptions} queryOptions
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>}
     */
    private async *multiChannelObjectIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        const channels = await this.getMatchingChannelInfos(queryOptions);

        // prepare the options for the single channel iterator
        let from: Date | undefined;
        let to: Date | undefined;
        let ids: string[] | undefined;
        let types: string[] | undefined;
        let omitData: boolean | undefined;

        if (queryOptions) {
            from = queryOptions.from;
            to = queryOptions.to;
            if (queryOptions.id) {
                ids = [queryOptions.id];
            }
            if (queryOptions.ids) {
                ids = queryOptions.ids;
            }
            if (queryOptions.type) {
                types = [queryOptions.type];
            }
            if (queryOptions.types) {
                types = queryOptions.types;
            }
            if (queryOptions.omitData) {
                omitData = queryOptions.omitData;
            }
        }

        // Create a iterator for each selected channel
        const iterators = channels.map(channel =>
            ChannelManager.singleChannelObjectIterator(channel, from, to, ids)
        );

        // Determine the access rights of each channel
        const sharedWithPersonsMap = new Map<SHA256IdHash<ChannelInfo>, SHA256IdHash<Person>[]>();
        await Promise.all(
            channels.map(async channel => {
                const channelInfoIdHash = await calculateIdHashOfObj(channel);
                const sharedWithPersons = await ChannelManager.sharedWithPersonsList(
                    channelInfoIdHash
                );
                sharedWithPersonsMap.set(channelInfoIdHash, sharedWithPersons);
            })
        );

        // Iterate over all channels and fetch the data
        for await (const entry of ChannelManager.mergeIteratorMostCurrent(iterators, false)) {
            // Get the shared with status from the precompiled map
            const sharedWith = sharedWithPersonsMap.get(entry.channelInfoIdHash);
            if (!sharedWith) {
                throw new Error(
                    `Programming Error: Shared with map didn't have entry for channel ${entry.channelInfoIdHash}`
                );
            }

            // Load the object to compare the type
            // AUTHORIZED HACK - casting undefined to any type because
            // making the data field optional would cause problems
            // in other apps.
            const data =
                omitData === undefined || !omitData
                    ? await getObject(entry.dataHash)
                    : (undefined as any);

            if (data && types && !types.includes(data.$type$)) {
                continue;
            }

            // Build meta data object and return it
            yield {
                channelId: entry.channelInfo.id,
                channelOwner: entry.channelInfo.owner,
                channelEntryHash: entry.channelEntryHash,
                id: ChannelManager.encodeEntryId(entry.channelInfoIdHash, entry.channelEntryHash),

                creationTime: new Date(entry.creationTime),
                author: entry.channelInfo.owner,
                sharedWith: sharedWith,

                data: data,
                dataHash: entry.dataHash
            };
        }
    }

    /**
     * This iterator just iterates the data elements of the passed channel.
     *
     * Note: If you want to start iterating from a specific point in the chain
     * and not from the start, you can just construct your own ChannelInfo object
     * and set the head to the ChannelEntry where you want to start iterating.
     *
     * @param {ChannelInfo} channelInfo - iterate this channel
     * @param {Date} from
     * @param {Date} to
     * @param {string[]} ids
     * @returns {AsyncIterableIterator<RawChannelEntry>}
     */
    private static async *singleChannelObjectIterator(
        channelInfo: ChannelInfo,
        from?: Date,
        to?: Date,
        ids?: string[]
    ): AsyncIterableIterator<RawChannelEntry> {
        logWithId(channelInfo.id, channelInfo.owner, 'singleChannelObjectIterator - ENTER');

        // Select the item or entry iterator based on whether ids were passed
        if (ids) {
            yield* this.itemIterator(channelInfo, ids, from, to);
        } else {
            yield* this.entryIterator(channelInfo, from, to);
        }

        logWithId(
            channelInfo.id,
            channelInfo.owner,
            'singleChannelObjectIterator - LEAVE: exhausted entries'
        );
    }

    /**
     * This iterator just iterates the data elements of the passed channel.
     *
     * Note: If you want to start iterating from a specific point in the chain
     * and not from the start, you can just construct your own ChannelInfo object
     * and set the head to the ChannelEntry where you want to start iterating.
     *
     * @param {ChannelInfo} channelInfo - iterate this channel
     * @param {Date} from
     * @param {Date} to
     * @returns {AsyncIterableIterator<RawChannelEntry>}
     */
    private static async *entryIterator(
        channelInfo: ChannelInfo,
        from?: Date,
        to?: Date
    ): AsyncIterableIterator<RawChannelEntry> {
        logWithId(channelInfo.id, channelInfo.owner, 'entryIterator - ENTER');
        if (!channelInfo.head) {
            logWithId(channelInfo.id, channelInfo.owner, 'entryIterator - LEAVE: no entries');
            return;
        }
        const channelInfoIdHash = await calculateIdHashOfObj(channelInfo);

        // Iterate over all elements and yield each element
        let currentEntryHash: SHA256Hash<ChannelEntry> | undefined = channelInfo.head;
        while (currentEntryHash) {
            logWithId_Debug(
                channelInfo.id,
                channelInfo.owner,
                `entryIterator: iterate ${currentEntryHash}`
            );

            const entry: ChannelEntry = await getObject(currentEntryHash);
            const creationTimeHash = entry.data;
            const creationTime = await getObject(creationTimeHash);

            // Filter elements based on from / to
            if (from && creationTime.timestamp < from.getTime()) {
                break;
            }
            if (to && creationTime.timestamp > to.getTime()) {
                currentEntryHash = entry.previous;
                continue;
            }

            yield {
                channelInfo: channelInfo,
                channelInfoIdHash: channelInfoIdHash,
                channelEntryHash: currentEntryHash,
                creationTimeHash: creationTimeHash,
                creationTime: creationTime.timestamp,
                dataHash: creationTime.data
            };

            currentEntryHash = entry.previous;
        }

        logWithId(channelInfo.id, channelInfo.owner, 'entryIterator - LEAVE: exhausted entries');
    }

    /**
     * This iterator just iterates over the elements with the passed ids.
     *
     * @param {ChannelInfo} channelInfo
     * @param {string[]} ids
     * @param {Date} from
     * @param {Date} to
     * @returns {AsyncIterableIterator<RawChannelEntry>}
     */
    private static async *itemIterator(
        channelInfo: ChannelInfo,
        ids: string[],
        from?: Date,
        to?: Date
    ): AsyncIterableIterator<RawChannelEntry> {
        logWithId(channelInfo.id, channelInfo.owner, 'itemIterator - ENTER');

        // Calculate the id hash
        const channelInfoIdHash = await calculateIdHashOfObj(channelInfo);

        // Extract the items for which we have the id
        const entries = [];
        for (const id of ids) {
            const entryData = ChannelManager.decodeEntryId(id);
            if (entryData.channelInfoIdHash !== channelInfoIdHash) {
                continue;
            }

            const entry: ChannelEntry = await getObject(entryData.channelEntryHash);
            const creationTimeHash = entry.data;
            const creationTime = await getObject(creationTimeHash);

            if (to && creationTime.timestamp > to.getTime()) {
                continue;
            }

            if (from && creationTime.timestamp < from.getTime()) {
                continue;
            }

            entries.push({
                channelInfo: channelInfo,
                channelInfoIdHash: channelInfoIdHash,
                channelEntryHash: entryData.channelEntryHash,
                creationTimeHash: creationTimeHash,
                creationTime: creationTime.timestamp,
                dataHash: creationTime.data
            });
        }

        // Sort the items
        entries.sort((a, b) => b.creationTime - a.creationTime);

        // yield the items
        yield* entries;

        logWithId(channelInfo.id, channelInfo.owner, 'itemIterator - LEAVE: exhausted entries');
    }

    /**
     * Iterate multiple iterators by returning always the most current element of all of them.
     *
     * It is assumed, that the iterators will return the elements sorted from highest to
     * lowest value.
     *
     * Example:
     *
     * If you have multiple iterators (iter1, iter2, iter3) that would return these items:
     * - iter1: 9, 5, 3
     * - iter2: 8, 7, 6, 1
     * - iter3: 4, 2
     *
     * Then this iterator implementation would return the items with these creation times:
     * 9, 8, 7, 6, 5, 4, 3, 2, 1
     *
     * @param {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>[]} iterators
     * @param {boolean} terminateOnSingleIterator - If true, then stop iteration when all but one iterator reached
     *                                              their end. The first element of the last iterator is still
     *                                              returned, but then iteration stops. This is very useful
     *                                              for merging algorithms, because they can use the last item as
     *                                              common history for merging.
     *                                              Because this iteration also removes redundant iterators
     *                                              (that iterate over the same history) it will stop when multiple
     *                                              iterators iterate the same history.
     * @param yieldCommonHistoryElement           - If true (default) the common history element will be yielded as last element
     * @param onlyDifferentElements               - If true (default false) only elements that are only in a single channel are yielded.
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>}
     */
    private static async *mergeIteratorMostCurrent(
        iterators: AsyncIterableIterator<RawChannelEntry>[],
        terminateOnSingleIterator: boolean = false,
        yieldCommonHistoryElement: boolean = true,
        onlyDifferentElements: boolean = false
    ): AsyncIterableIterator<RawChannelEntry> {
        logWithId(null, null, `mergeIteratorMostCurrent - ENTER: ${iterators.length} iterators`);

        // This array holds the topmost value of each iterator
        // The position of the element in this array matches the position in the iterators array.
        // Those values are then compared and the one with the highest
        // timestamp is returned and then replaced by the next one on each iteration
        let currentValues: (RawChannelEntry | undefined)[] = [];
        let previousItem: RawChannelEntry | undefined = undefined;

        // Initial fill of the currentValues iterator with the most current elements of each iterator
        for (const iterator of iterators) {
            currentValues.push((await iterator.next()).value);
        }

        // Iterate over all (output) items
        // The number of the iterations will be the sum of all items returned by all iterators.
        // For the above example it would be 9 iterations.
        while (true) {
            // determine the largest element in currentValues
            let mostCurrentItem: RawChannelEntry | undefined = undefined;
            let mostCurrentIndex: number = 0;
            let activeIterators: number = 0;

            for (let i = 0; i < currentValues.length; i++) {
                const currentValue = currentValues[i];

                // Ignore values from iterators that have reached their end (returned undefined)
                if (currentValue === undefined) {
                    continue;
                } else {
                    ++activeIterators;
                }

                // This checks whether we have an element to compare to (so i is at least 1)
                if (mostCurrentItem) {
                    // Skip elements that are older (less current)
                    if (currentValue.creationTime < mostCurrentItem.creationTime) {
                        continue;
                    }

                    // If the timestamp is equal, then sort by time hash to have a predictable order
                    if (
                        currentValue.creationTime === mostCurrentItem.creationTime &&
                        currentValue.creationTimeHash < mostCurrentItem.creationTimeHash
                    ) {
                        continue;
                    }

                    // Ignore elements with the same history (same channel id and same entry => history is the same)
                    // This is mostly required if we mergeIterate multiple versions of the same channel.
                    // The merge algorithm uses this.
                    if (
                        currentValue.creationTime === mostCurrentItem.creationTime &&
                        currentValue.channelEntryHash === mostCurrentItem.channelEntryHash &&
                        currentValue.channelInfoIdHash === mostCurrentItem.channelInfoIdHash
                    ) {
                        // This removes the current element from the currentValues list
                        // Thus the corresponding iterator will never be advanced again, so
                        // we effectively removed the duplicate history from the iteration
                        currentValues[i] = undefined;
                        --activeIterators;
                        continue;
                    }
                }

                // If we made it to here, then we have a larger element - remember it
                mostCurrentItem = currentValues[i];
                mostCurrentIndex = i;
            }

            // If no element was found, this means that all iterators reached their ends => terminate the loop
            if (mostCurrentItem === undefined) {
                break;
            }

            // For only different elements option we call next for all equal elements and if we have the same
            // elements multiple times we don't yield.
            if (onlyDifferentElements) {
                // Same get the indices of the currentValues that are qual to the most current element
                const sameIndices: number[] = [];
                for (let i = 0; i < currentValues.length; i++) {
                    const currentValue = currentValues[i];

                    // Ignore values from iterators that have reached their end (returned undefined)
                    if (currentValue === undefined) {
                        continue;
                    }

                    if (
                        currentValue.creationTimeHash === mostCurrentItem.creationTimeHash &&
                        currentValue.channelInfoIdHash === mostCurrentItem.channelInfoIdHash
                    ) {
                        sameIndices.push(i);
                    }
                }

                // Advance all equal element iterators
                for (const index of sameIndices) {
                    currentValues[index] = (await iterators[index].next()).value;
                }

                // If we don't advanced all iterators, then it is a difference, because one channel
                // is missing this element.
                if (sameIndices.length === iterators.length) {
                    continue;
                }
            } else {
                // Advance the iterator that yielded the highest creationTime
                currentValues[mostCurrentIndex] = (await iterators[mostCurrentIndex].next()).value;
            }

            // If we have one active iterator remaining and the user requested it, we terminate
            // This is done before the yield, because we want the first element of the remaining
            // iterator not to be returned.
            if (terminateOnSingleIterator && !yieldCommonHistoryElement && activeIterators === 1) {
                break;
            }

            // Filter for duplicates
            if (
                previousItem &&
                previousItem.creationTime === mostCurrentItem.creationTime &&
                previousItem.creationTimeHash === mostCurrentItem.creationTimeHash &&
                previousItem.channelInfoIdHash === mostCurrentItem.channelInfoIdHash
            ) {
                logWithId_Debug(
                    null,
                    null,
                    `mergeIteratorMostCurrent: skipped value from iterator ${mostCurrentIndex}: duplicate with previous`
                );
            } else {
                logWithId_Debug(
                    null,
                    null,
                    `mergeIteratorMostCurrent: picked value from iterator ${mostCurrentIndex}`
                );

                // Yield the value that has the highest creationTime
                yield mostCurrentItem;

                // If we have one active iterator remaining and the user requested it, we terminate
                // This is done after the yield, because we want the first element of the remaining
                // iterator to be returned.
                if (
                    terminateOnSingleIterator &&
                    yieldCommonHistoryElement &&
                    activeIterators === 1
                ) {
                    break;
                }
            }

            previousItem = mostCurrentItem;
        }

        logWithId(null, null, 'mergeIteratorMostCurrent - LEAVE');
    }

    // ######## Merge algorithm methods ########

    /**
     * Merge unmerged channel versions.
     *
     * @returns {Promise<void>}
     */
    private async mergeAllUnmergedChannelVersions(): Promise<void> {
        logWithId(null, null, 'mergeAllUnmergedChannelVersions - START');
        for (const hash of this.channelInfoCache.keys()) {
            await this.mergePendingVersions(hash);
        }
        logWithId(null, null, 'mergeAllUnmergedChannelVersions - END');
    }

    /**
     * Merge all pending versions of passed channel.
     *
     * @param {SHA256IdHash<ChannelInfo>} channelInfoIdHash - id hash of the channel for which to merge versions
     * @returns {Promise<void>}
     */
    private async mergePendingVersions(
        channelInfoIdHash: SHA256IdHash<ChannelInfo>
    ): Promise<void> {
        // Determine the channel id and owner
        let channelId: string;
        let channelOwner: SHA256IdHash<Person>;
        {
            const channelInfo = await getObjectByIdHash(channelInfoIdHash);
            channelId = channelInfo.obj.id;
            channelOwner = channelInfo.obj.owner;
        }

        try {
            logWithId(channelId, channelOwner, 'mergePendingVersions - START');

            await serializeWithType(`${this.cacheLockName}${channelInfoIdHash}`, async () => {
                // Load the cache entry for the latest merged version
                const cacheEntry = this.channelInfoCache.get(channelInfoIdHash);
                if (!cacheEntry) {
                    throw new Error('The channelInfoIdHash does not exist in registry.');
                }

                // Determine which versions to merge and their channelInfos
                let firstVersionToMerge: number;
                let lastVersionToMerge: number;
                let channelInfosToMerge: ChannelInfo[];
                {
                    //  Determine the first version to merge
                    if (cacheEntry.latestMergedVersionIndex < cacheEntry.readVersionIndex) {
                        // If the read pointer is in the future of the merge pointer, then the
                        // read version already includes the latest merged version => merged + 1
                        firstVersionToMerge = cacheEntry.latestMergedVersionIndex + 1;
                    } else {
                        // This usually means the read pointer is equal to the merge pointer, so
                        // include this version in the merge range.
                        firstVersionToMerge = cacheEntry.readVersionIndex;
                    }

                    // Find the last version to merge based on the version map
                    const versionMapEntries = await getAllVersionMapEntries(channelInfoIdHash);
                    lastVersionToMerge = versionMapEntries.length - 1;

                    // Get all ChannelInfo versions in the merge range
                    const channelInfoHashesToMerge = versionMapEntries
                        .slice(firstVersionToMerge)
                        .map(entry => entry.hash);

                    // Get the ChannelInfo object for all versions to merge
                    channelInfosToMerge = await Promise.all(
                        channelInfoHashesToMerge.map(getObject)
                    );

                    // Sanity check. It should always exist at least one version (the last of the merged ones)
                    if (channelInfosToMerge.length <= 0) {
                        throw new Error(
                            'Programming Error: The merge algorithm was called on a non existing channel.'
                        );
                    }

                    // If we have only one version to merge, that means that this is the version that was already
                    // merged by a previous run. In this case we don't need to do anything and just return.
                    if (channelInfosToMerge.length === 1) {
                        logWithId(
                            channelId,
                            channelOwner,
                            `mergePendingVersions - END: all versions already merged`
                        );
                        return;
                    }
                }

                logWithId(
                    channelId,
                    channelOwner,
                    `mergePendingVersions: versions ${firstVersionToMerge} to ${lastVersionToMerge}`
                );

                // Construct the iterators from the channelInfo representing the different versions
                const iterators = channelInfosToMerge.map(item =>
                    ChannelManager.singleChannelObjectIterator(item)
                );

                // Iterate over all channel versions simultaneously until
                // 1) there is only a common history left
                // 2) there is only one channel left with elements
                let commonHistoryHead: SHA256Hash<ChannelEntry> | null = null; // This will be the remaining history that doesn't need to be merged
                const unmergedElements: SHA256Hash<CreationTime>[] = []; // This are the CreationTime hashes that need to be part of the new history
                for await (const elem of ChannelManager.mergeIteratorMostCurrent(iterators, true)) {
                    commonHistoryHead = elem.channelEntryHash;
                    unmergedElements.push(elem.creationTimeHash);
                }
                unmergedElements.pop(); // The last element is the creationTimeHash of the common history head => remove it

                // If anything was returned, then we need to
                // 1) rebuild the chain (if unmerged elements exist)
                // 2) generate a new version with the head (if the same head is not already the latest version)
                // 3) advance to merge pointer to the proper location (always)
                if (commonHistoryHead) {
                    logWithId(
                        channelId,
                        channelOwner,
                        `mergePendingVersions: rebuild ${unmergedElements.length} entries on top of ${commonHistoryHead}`
                    );

                    // Rebuild the channel by adding the unmerged elements of the channels on top of the
                    // common history if we have unmerged entries
                    let rebuiltHead;
                    if (unmergedElements.length > 0) {
                        const result = (await createSingleObjectThroughPurePlan(
                            {module: '@module/channelRebuildEntries'},
                            channelId,
                            channelOwner,
                            commonHistoryHead,
                            unmergedElements
                        )) as UnversionedObjectResult<ChannelEntry>;
                        rebuiltHead = result.hash;
                    } else {
                        rebuiltHead = commonHistoryHead;
                    }

                    // Write the new channel head only if it differs from the previous one
                    if (rebuiltHead !== channelInfosToMerge[channelInfosToMerge.length - 1].head) {
                        const newVersion = (await createSingleObjectThroughPurePlan(
                            {
                                module: '@module/channelSetHead',
                                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                            },
                            channelId,
                            channelOwner,
                            rebuiltHead
                        )) as VersionedObjectResult<ChannelInfo>;

                        // Let's calculate the position of the generated version in the version map
                        let newVersionIndex = lastVersionToMerge;
                        {
                            const versionMapEntries = await getAllVersionMapEntries(
                                channelInfoIdHash
                            );
                            for (
                                let i = lastVersionToMerge + 1;
                                i < versionMapEntries.length;
                                ++i
                            ) {
                                if (versionMapEntries[i].hash === newVersion.hash) {
                                    newVersionIndex = i;
                                    break;
                                }
                            }
                        }

                        // Now let's see if another version has arrived between the latest merged version and
                        // the newly generated version
                        if (newVersionIndex == lastVersionToMerge + 1) {
                            // We have no intermediate version, so set the merge and read pointer to this version
                            cacheEntry.readVersion = newVersion.obj;
                            cacheEntry.readVersionIndex = newVersionIndex;
                            cacheEntry.latestMergedVersionIndex = newVersionIndex;

                            logWithId(
                                channelId,
                                channelOwner,
                                'mergePendingVersions - END: merge successful - no intermediate version'
                            );
                        } else {
                            // We have an intermediate version, so set the read pointer ahead of the merge pointer
                            cacheEntry.readVersion = newVersion.obj;
                            cacheEntry.readVersionIndex = newVersionIndex;
                            cacheEntry.latestMergedVersionIndex = lastVersionToMerge;

                            logWithId(
                                channelId,
                                channelOwner,
                                'mergePendingVersions - END: merge successful - intermediate version detected'
                            );
                        }
                    } else {
                        // We can set the merge and read pointer to lastVersionToMerge, because it has exactly the
                        // state that the merge algorithm wants to create.
                        cacheEntry.readVersion =
                            channelInfosToMerge[channelInfosToMerge.length - 1];
                        cacheEntry.readVersionIndex = lastVersionToMerge;
                        cacheEntry.latestMergedVersionIndex = lastVersionToMerge;

                        logWithId(
                            channelId,
                            channelOwner,
                            'mergePendingVersions - END: Not writing merge version: Latest version already includes everything'
                        );
                    }
                } else {
                    // We have no entries in any of the channels, this  means that all versions
                    // are empty and the merge result is also empty, so setting the merge and read
                    // pointer to lastVersionToMerge is ok
                    cacheEntry.readVersion = channelInfosToMerge[channelInfosToMerge.length - 1];
                    cacheEntry.readVersionIndex = lastVersionToMerge;
                    cacheEntry.latestMergedVersionIndex = lastVersionToMerge;

                    logWithId(
                        channelId,
                        channelOwner,
                        'mergePendingVersions - END: Not writing merge version: only empty channels'
                    );
                }

                await this.saveRegistryCacheToOne();

                // notify the post calls, that their version was merged
                for (const handler of cacheEntry.mergedHandlers) {
                    handler();
                }
                cacheEntry.mergedHandlers = [];

                // Emit the updated event when the read pointer changed
                // We wouldn't need to emit every time ... especially not if the previous
                // read pointer is compatible to the new one (has the same head pointer in the
                // channel info). But let's think about this later :-)
                this.emit('updated', channelId, channelOwner);
                this.onUpdated.emit(channelId, channelOwner);
            });
        } catch (e) {
            logWithId(channelId, channelOwner, 'mergePendingVersions - FAIL: ' + e.toString());
            throw e;
        }
    }

    // ######## Entry id and channel selection stuff ########

    /**
     * Encodes an entry as string for referencing and loading it later.
     *
     * @param {SHA256IdHash<ChannelInfo>} channelInfoIdHash
     * @param {SHA256Hash<ChannelEntry>} channelEntryHash
     * @returns {string}
     */
    private static encodeEntryId(
        channelInfoIdHash: SHA256IdHash<ChannelInfo>,
        channelEntryHash: SHA256Hash<ChannelEntry>
    ): string {
        return `${channelInfoIdHash}_${channelEntryHash}`;
    }

    /**
     * Decodes the string identifying an entry.
     *
     * @param {string} id
     * @returns {{channelInfoIdHash: SHA256IdHash<ChannelInfo>; channelEntryHash: SHA256Hash<ChannelEntry>}}
     */
    private static decodeEntryId(
        id: string
    ): {
        channelInfoIdHash: SHA256IdHash<ChannelInfo>;
        channelEntryHash: SHA256Hash<ChannelEntry>;
    } {
        const idElements = id.split('_');
        if (idElements.length != 2) {
            throw new Error('Id of channel entry is not valid.');
        }
        return {
            channelInfoIdHash: ensureIdHash<ChannelInfo>(idElements[0]),
            channelEntryHash: ensureHash<ChannelEntry>(idElements[1])
        };
    }

    /**
     * This returns the list of matching channel infos based on ChannelSelectionOptions.
     *
     * It usually returns the channel infos of the latest merged versions, not the latest version in the version maps.
     * Only if the ChannelSelectionOptions reference a specific version this version is returned instead of the latest
     * merged one.
     *
     * @param {ChannelSelectionOptions} options
     * @returns {Promise<ChannelInfo[]>}
     */
    private async getMatchingChannelInfos(
        options?: ChannelSelectionOptions
    ): Promise<ChannelInfo[]> {
        logWithId(null, null, `getMatchingChannelInfos - START: ${JSON.stringify(options)}`);

        // #### Check parameters ####

        if (options && options.channelId && options.channelIds) {
            throw new Error(
                "You cannot specify 'channelId' and 'channelIds' at the same time in query options!"
            );
        }
        if (options && options.owner && options.owners) {
            throw new Error(
                "You cannot specify 'owner' and 'owners' at the same time in query options!"
            );
        }
        if (options && options.channel && options.channels) {
            throw new Error(
                "You cannot specify 'channel' and 'channels' at the same time in query options!"
            );
        }
        if (options && options.id && options.ids) {
            throw new Error("You cannot specify 'id' and 'ids' at the same time in query options!");
        }
        if (options && options.channelInfoHash && options.channelInfoHashes) {
            throw new Error(
                "You cannot specify 'channelInfoHash' and 'channelInfoHashes' at the same time in query options!"
            );
        }
        if (options && options.channelInfoIdHash && options.channelInfoIdHashes) {
            throw new Error(
                "You cannot specify 'channelInfoHash' and 'channelInfoHashes' at the same time in query options!"
            );
        }

        // #### Map parameters ####

        // Map options.channelId(s) to a single variable
        let channelIds: string[] | null = null;
        if (options && options.channelId) {
            channelIds = [options.channelId];
        }
        if (options && options.channelIds) {
            channelIds = options.channelIds;
        }

        // Map options.owner(s) to a single variable
        let owners: SHA256IdHash<Person>[] | null = null;
        if (options && options.owner) {
            owners = [options.owner];
        }
        if (options && options.owners) {
            owners = options.owners;
        }

        // Map options.channel(s) to a single variable
        let channels: Channel[] | null = null;
        if (options && options.channel) {
            channels = [options.channel];
        }
        if (options && options.channels) {
            channels = options.channels;
        }

        // Map options.id(s) to a single variable
        let ids: string[] | null = null;
        if (options && options.id) {
            ids = [options.id];
        }
        if (options && options.ids) {
            ids = options.ids;
        }

        // Map options.channelInfoHash(es) to a single variable
        let channelInfoHashes: SHA256Hash<ChannelInfo>[] | null = null;
        if (options && options.channelInfoHash) {
            channelInfoHashes = [options.channelInfoHash];
        }
        if (options && options.channelInfoHashes) {
            channelInfoHashes = options.channelInfoHashes;
        }

        // Map options.channelInfoIdHash(es) to a single variable
        let channelInfoIdHashes: SHA256IdHash<ChannelInfo>[] | null = null;
        if (options && options.channelInfoIdHash) {
            channelInfoIdHashes = [options.channelInfoIdHash];
        }
        if (options && options.channelInfoIdHashes) {
            channelInfoIdHashes = options.channelInfoIdHashes;
        }

        // #### Get channel ids / infos from parameters ####

        // Variables will be filled with all channels that need to be selected
        // At the end the id hashes will also be appended to the ChannelInfos
        let selectedChannelInfos: ChannelInfo[] = [];
        let selectedChannelIdHashes: SHA256IdHash<ChannelInfo>[] = [];

        // Channel selection based on user / channel id
        // It is an AND relation, so both criteria have to match in order for the channel to
        // be selected
        if (owners || channelIds) {
            for (const channelInfo of this.channelInfoCache.values()) {
                if (channelIds && !channelIds.includes(channelInfo.readVersion.id)) {
                    continue;
                }
                if (owners && !owners.includes(channelInfo.readVersion.owner)) {
                    continue;
                }
                selectedChannelInfos.push(channelInfo.readVersion);
            }
        }

        // Channel selection by Channel object
        // Calculate the id hashes of the matching channels
        if (channels) {
            const idHashes = await Promise.all(
                channels.map(channel =>
                    calculateIdHashOfObj({
                        $type$: 'ChannelInfo',
                        id: channel.id,
                        owner: channel.owner
                    })
                )
            );
            selectedChannelIdHashes.push(...idHashes);
        }

        // Channel selection by explicit versions
        // Get the ChannelInfo objects from the instance and add them to the list.
        if (channelInfoHashes) {
            selectedChannelInfos.push(
                ...(await Promise.all(
                    channelInfoHashes.map(channelInfoHash => getObject(channelInfoHash))
                ))
            );
        }

        // Channel selection by the id hash
        if (channelInfoIdHashes) {
            selectedChannelIdHashes.push(...channelInfoIdHashes);
        }

        // Channel selection by specific object id
        if (ids) {
            selectedChannelIdHashes.push(
                ...ids.map(id => ChannelManager.decodeEntryId(id).channelInfoIdHash)
            );
        }

        // If no selection was done, then return all of them
        if (
            !channelIds &&
            !owners &&
            !channels &&
            !channelInfoHashes &&
            !channelInfoIdHashes &&
            !ids
        ) {
            for (const channelInfo of this.channelInfoCache.values()) {
                selectedChannelInfos.push(channelInfo.readVersion);
            }
        }

        // #### Channel Id to latest merged version conversion ####

        // For the selection methods that just returned channel ids we need to get the latest merged versions
        if (selectedChannelIdHashes) {
            for (const channelInfoIdHash of selectedChannelIdHashes) {
                const channelInfo = this.channelInfoCache.get(channelInfoIdHash);
                if (!channelInfo) {
                    throw new Error(`Channel ${channelInfoIdHash} does not exist!`);
                }
                selectedChannelInfos.push(channelInfo.readVersion);
            }
        }

        // Remove duplicates. Since these are pointers to the objects in the cahce
        // the unification works based on the addresses of the ChannelInfo instance in the cache.
        const uniqueSelection = Array.from(new Set(selectedChannelInfos));

        logWithId(
            null,
            null,
            `getMatchingChannelInfos - End: selected ${uniqueSelection.length} channels/versions`
        );
        return uniqueSelection;
    }

    // ######## Hook implementation for merging and adding channels ########

    /**
     * Handler function for the VersionedObj
     * @param {VersionedObjectResult} caughtObject
     * @return {Promise<void>}
     */
    private async handleOnVersionedObj(caughtObject: VersionedObjectResult): Promise<void> {
        try {
            if (isChannelInfoResult(caughtObject)) {
                // Determine the channel id and owner
                let channelId: string;
                let channelOwner: SHA256IdHash<Person>;
                {
                    const channelInfo = await getObjectByIdHash(caughtObject.idHash);
                    channelId = channelInfo.obj.id;
                    channelOwner = channelInfo.obj.owner;
                }

                // Add channel and merge versions
                try {
                    logWithId(channelId, channelOwner, 'handleOnVersionedObj - START');
                    await this.addChannelIfNotExist(caughtObject.idHash);
                    await this.mergePendingVersions(caughtObject.idHash);
                    logWithId(channelId, channelOwner, 'handleOnVersionedObj - END');
                } catch (e) {
                    logWithId(
                        channelId,
                        channelOwner,
                        'handleOnVersionedObj - FAIL: ' + e.toString()
                    );
                    console.error(e); // Introduce an error event later!
                }
            }
        } catch (e) {
            console.error(e); // Introduce an error event later!
        }
    }

    /**
     * Add the passed channel to the cache & registry if it is not there, yet.
     *
     * @param {SHA256IdHash<ChannelInfo>} channelInfoIdHash - the channel to add to the registry
     * @returns {Promise<void>}
     */
    private async addChannelIfNotExist(
        channelInfoIdHash: SHA256IdHash<ChannelInfo>
    ): Promise<void> {
        // Determine the channel id and owner
        let channelId: string;
        let channelOwner: SHA256IdHash<Person>;
        {
            const channelInfo = await getObjectByIdHash(channelInfoIdHash);
            channelId = channelInfo.obj.id;
            channelOwner = channelInfo.obj.owner;
        }

        try {
            await serializeWithType(`${this.cacheLockName}${channelInfoIdHash}`, async () => {
                logWithId(channelId, channelOwner, 'addChannelIfNotExist - START');
                if (!this.channelInfoCache.has(channelInfoIdHash)) {
                    this.channelInfoCache.set(channelInfoIdHash, {
                        readVersion: await getObject(
                            await getNthVersionMapHash(channelInfoIdHash, 0)
                        ),
                        readVersionIndex: 0,
                        latestMergedVersionIndex: 0,
                        mergedHandlers: []
                    });
                    await this.saveRegistryCacheToOne();
                    logWithId(channelId, channelOwner, 'addChannelIfNotExist - END: added');
                } else {
                    logWithId(
                        channelId,
                        channelOwner,
                        'addChannelIfNotExist - END: already existed'
                    );
                }
            });
        } catch (e) {
            logWithId(channelId, channelOwner, 'addChannelIfNotExist - FAIL: ' + e.toString());
            throw e;
        }
    }

    // ######## One Channel registry read / write methods ########

    /**
     * Save the cache content as new version of registry in one.
     *
     * @returns {Promise<void>}
     */
    private async saveRegistryCacheToOne(): Promise<void> {
        await serializeWithType(this.registryLockName, async () => {
            const channels: ChannelRegistryEntry[] = [];
            for (const [idHash, cacheEntry] of this.channelInfoCache) {
                channels.push({
                    channelInfoIdHash: idHash,
                    readVersionIndex: cacheEntry.readVersionIndex,
                    mergedVersionIndex: cacheEntry.latestMergedVersionIndex
                });
            }

            // Write the registry version
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'ChannelRegistry',
                    id: 'ChannelRegistry',
                    channels: channels
                }
            );
        });
    }

    /**
     * Load the latest channel registry version into the the cache.
     *
     * @returns {Promise<void>}
     */
    private async loadRegistryCacheFromOne(): Promise<void> {
        logWithId(null, null, 'loadRegistryCacheFromOne - START');
        await serializeWithType(this.registryLockName, async () => {
            // If the cache is not empty, then something is wrong.
            // The current implementation only needs to populate it once - at init and there it should be empty.
            if (this.channelInfoCache.size > 0) {
                throw new Error('Populating the registry cache is only allowed if it is empty!');
            }

            // Get the registry. If it does not exist, start with an empty cache (so just return)
            let registry: ChannelRegistry;
            try {
                registry = (
                    await getObjectByIdObj({$type$: 'ChannelRegistry', id: 'ChannelRegistry'})
                ).obj;
            } catch (e) {
                return;
            }

            // We load the latest merged version for all channels
            // Warning: this might be very memory hungry, because we load this stuff in parallel,
            // so potentially all version maps of all channels are in memory simultaneously.
            // This issue should be fixed by allowing partial version loads or by changing the way that
            // version maps work - or by not using version maps at all.
            // Short term fix might be by serializing all the loads, but this will significantly increase
            // load time - so let's stick with the parallel version for now.
            await Promise.all(
                registry.channels.map(async channel => {
                    const channelInfoHash = await getNthVersionMapHash(
                        channel.channelInfoIdHash,
                        channel.readVersionIndex
                    );
                    this.channelInfoCache.set(channel.channelInfoIdHash, {
                        readVersion: await getObject(channelInfoHash),
                        readVersionIndex: channel.readVersionIndex,
                        latestMergedVersionIndex: channel.mergedVersionIndex,
                        mergedHandlers: []
                    });
                })
            );
        });
        logWithId(null, null, 'loadRegistryCacheFromOne - END');
    }

    // ######## Access stuff ########

    /**
     * Note: This function needs to be cleaned up a little! That is why it is down here with the private methods
     *       because atm I don't encourage anybody to use it, unless he doesn't have another choice.
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
        const channels = await this.getMatchingChannelInfos({channelId});

        if (to === undefined) {
            const accessChannels = await Promise.all(
                channels.map(async channelInfo => {
                    return {
                        id: await calculateIdHashOfObj(channelInfo),
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
            channels.map(async channelInfo => {
                return {
                    id: await calculateIdHashOfObj(channelInfo),
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
     * Get the person list with whom this channel is shared.
     *
     * This list also explodes the access groups and adds those persons to the returned list.
     *
     * @param {SHA256IdHash<ChannelInfo>} channelInfoIdHash
     * @returns {Promise<SHA256IdHash<Person>[]>}
     */
    private static async sharedWithPersonsList(
        channelInfoIdHash: SHA256IdHash<ChannelInfo>
    ): Promise<SHA256IdHash<Person>[]> {
        /**
         * Get the persons from the groups and persons of the passed access object.
         *
         * @param {SHA256Hash<IdAccess>} accessHash
         * @returns {Promise<SHA256IdHash<Person>[]>}
         */
        async function extractPersonsFromIdAccessObject(accessHash: SHA256Hash<IdAccess>) {
            const accessObject = await getObjectWithType(accessHash, 'IdAccess');
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
        }

        // Extract the access objects pointing to the channel info
        const channelAccessObjects = await getAllValues(channelInfoIdHash, true, 'IdAccess');
        const personNested = await Promise.all(
            channelAccessObjects.map(async (value: ReverseMapEntry<IdAccess>) =>
                extractPersonsFromIdAccessObject(value.toHash)
            )
        );
        const personsFlat = personNested.reduce(
            (acc: SHA256IdHash<Person>[], val: SHA256IdHash<Person>[]) => acc.concat(val),
            []
        );

        // Remove duplicate persons and return the result
        return [...new Set(personsFlat)];
    }
}
