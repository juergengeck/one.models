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
import {ensureHash, ensureIdHash} from 'one.core/lib/util/type-checks';

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
 * Options used for selecting a specific channel
 *
 * All elements are ANDed together, so if you specify channelId and owner you get exactly one channel.
 *
 * If an element is missing, this means that all of them should be queried.
 * If channelHash or channelHashes is specified, the channelId(s) and owner(s) is not allowed.
 */
export type ChannelSelectionOptions = {
    channelId?: string; // Query channels that have this id
    channelIds?: string[]; // Query channels that have one of these ids.
    owner?: SHA256IdHash<Person>; // Query channels that have this owner.
    owners?: SHA256IdHash<Person>[]; // Query channels that have one of these owners.
    channelHash?: SHA256Hash<ChannelInfo>; // iterate exactly this channel version
    channelHashes?: SHA256Hash<ChannelInfo>[]; // iterate exactly these channel versions
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

    id: string; // This id identifies the data point. It can be used to
    // reference this data point in other methods of this class.
    creationTime: Date; // Time when this data point was created
    author: SHA256IdHash<Person>; // Author of this data point (currently, this is always the owner)
    sharedWith: SHA256IdHash<Person>[]; // Who has access to this data

    data: T; // The data
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
 *
 * NOTE: This class manages one global one object called ChannelRegistry
 *       It therefore does not make sense to have multiple of such objects.
 *       We don't use a singleton, because it makes it harder to track where
 *       channels are used.
 *
 */
export default class ChannelManager extends EventEmitter {
    //private channelInfoLut_byChannelId: Map<string, SHA256IdHash<ChannelInfo>[]>;
    //private channelInfoLut_byOwner: Map<SHA256IdHash<Person>, SHA256IdHash<ChannelInfo>[]>;
    private channelInfoCache: Map<SHA256IdHash<ChannelInfo>, {latestMergedVersion: ChannelInfo}>;

    private defaultOwner: SHA256IdHash<Person> | null; // This is the person that is used as owner of the channel if
    // nothing else was specified at certain calls.
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
        this.channelInfoCache = new Map<
            SHA256IdHash<ChannelInfo>,
            {latestMergedVersion: ChannelInfo}
        >();
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
     * If the channel already exists, this call is a noop.
     *
     * @param {string} channelId - The id of the channel. See class description for more details on how ids and channels are handled.
     */
    public async createChannel(channelId: string): Promise<void> {
        logWithId_Debug(channelId, this.defaultOwner, `createChannel`);

        try {
            // Get the ChannelInfo from the database
            const channelInfoIdHash = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: channelId,
                owner: this.defaultOwner
            });

            await getObjectByIdHash<ChannelInfo>(channelInfoIdHash);
            logWithId(channelId, this.defaultOwner, `createChannel: Existed`);
        } catch (ignore) {
            // Create a new one if getting it failed
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

        // If owner was not specified, use the default owner
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
        const channels = await this.getMatchingChannels(queryOptions);

        // Create a iterator for each selected channel
        const iterators = channels.map(channel => ChannelManager.channelDataIterator(channel));

        // If no query options, then we don't need to iterate. Just forward to the iterator
        if (!queryOptions) {
            yield* ChannelManager.mergeIteratorMostCurrent(iterators);
        }

        // If we have query options then test each element against the options
        else {
            let elementCounter = 0;

            // Iterate over the merge iterator and filter unwanted elements
            for await (const element of ChannelManager.mergeIteratorMostCurrent(iterators)) {
                if (queryOptions.to !== undefined && element.creationTime > queryOptions.to) {
                    continue;
                }

                if (queryOptions.from !== undefined && element.creationTime < queryOptions.from) {
                    break;
                }

                if (queryOptions.count !== undefined && elementCounter >= queryOptions.count) {
                    break;
                }

                ++elementCounter;
                yield element;
            }
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
        // Type check against the type
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        // Iterate over all objects filtering out the ones with the wrong type
        for await (const obj of this.objectIterator(queryOptions)) {
            if (hasRequestedType(obj)) {
                yield obj;
            }
        }
    }

    // ######## Get data from channels - ITERATORS PRIVATE ########

    /**
     * This iterator just iterates the data elements of the passed channel.
     *
     * It returns the data with the metadata. So this function wraps
     * the metadata by using the ObjectData<T> container.
     *
     * Note: If you want to start iterating from a specific point in the chain
     * and not from the start, you can just construct your own ChannelInfo object
     * and set the head to the ChannelEntry where you want to start iterating.
     *
     * @param {ChannelInfo} channelInfo - iterate this channel
     * @returns {AsyncIterableIterator<ChannelEntry['data']>}
     */
    private static async *channelDataIterator(
        channelInfo: ChannelInfo
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        if (!channelInfo.head) {
            return;
        }

        // Load the persons that have access to this channel
        const channelInfoIdHash = await calculateIdHashOfObj(channelInfo);
        const sharedWithPersons = await ChannelManager.sharedWithPersonsList(channelInfoIdHash);

        // Iterate over all elements and yield each element
        let currentEntryHash: SHA256Hash<ChannelEntry> | undefined = channelInfo.head;
        while (currentEntryHash) {
            const entry: ChannelEntry = await getObject(currentEntryHash);
            const creationTimeHash = entry.data;
            const creationTime = await getObject(creationTimeHash);
            const dataHash = creationTime.data;
            const data = await getObject(dataHash);

            yield {
                channelId: channelInfo.id,
                channelOwner: channelInfo.owner,

                id: ChannelManager.encodeEntryId(channelInfoIdHash, currentEntryHash),

                creationTime: new Date(creationTime.timestamp),
                author: channelInfo.owner,
                sharedWith: sharedWithPersons,

                data: data
            };

            currentEntryHash = entry.previous;
        }
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
     * @returns {AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>}
     */
    private static async *mergeIteratorMostCurrent(
        iterators: AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>>[]
    ): AsyncIterableIterator<ObjectData<OneUnversionedObjectTypes>> {
        // This array holds the topmost value of each iterator
        // The position of the element in this array matches the position in the iterators array.
        // Those values are then compared and the one with the highest
        // timestamp is returned and then replaced by the next one on each iteration
        let currentValues: ObjectData<OneUnversionedObjectTypes>[] = [];

        // Initial fill of the currentValues iterator with the most current elements of each iterator
        for (const iterator of iterators) {
            currentValues.push((await iterator.next()).value);
        }

        // Iterate over all (output) items
        // The number of the iterations will be the sum of all items returned by all iterators.
        // For the above example it would be 9 iterations.
        while (true) {
            // determine the largest element in currentValues
            let mostCurrentItem: ObjectData<OneUnversionedObjectTypes> | undefined = undefined;
            let mostCurrentIndex: number = 0;

            for (let i = 0; i < currentValues.length; i++) {
                // Ignore values from iterators that have reached their end (returned undefined)
                if (currentValues[i] === undefined) {
                    continue;
                }

                // If we found a more current element or none, yet - remember it
                if (
                    !mostCurrentItem ||
                    currentValues[i].creationTime > mostCurrentItem.creationTime
                ) {
                    mostCurrentItem = currentValues[i];
                    mostCurrentIndex = i;
                }
            }

            // If no element was found, this means that all iterators reached their ends => terminate the loop
            if (mostCurrentItem === undefined) {
                break;
            }

            // Advance the iterator that yielded the highest creationTime
            currentValues[mostCurrentIndex] = (await iterators[mostCurrentIndex].next()).value;

            // Yield the value that has the highest creationTime
            yield mostCurrentItem;
        }
    }

    // ######## OTHER PRIVATE ########

    /**
     * Encodes an entry as string, so that later it can be found again.
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
     * Decodes the string if of an etry, so that it can be loaded.
     *
     * @param {SHA256IdHash<ChannelInfo>} channelInfoIdHash
     * @param {SHA256Hash<ChannelEntry>} channelEntryHash
     * @returns {string}
     */
    private static decodeEntryId(
        id: string
    ): {
        channelInfoIdHash: SHA256IdHash<ChannelInfo>;
        channelEntryHash: SHA256Hash<ChannelEntry>;
    } {
        const idElems = id.split('_');
        if (idElems.length != 2) {
            throw new Error('Id of channel entry is not valid.');
        }
        return {
            channelInfoIdHash: ensureIdHash<ChannelInfo>(idElems[0]),
            channelEntryHash: ensureHash<ChannelEntry>(idElems[1])
        };
    }

    /**
     * This returns the list of matching channel infos based on ChannelSelectionOptions.
     *
     * It returns the channel infos of the latest merged versions, not the latest version in the version maps.
     *
     * @param {ChannelSelectionOptions} options
     * @returns {Promise<ChannelInfo[]>}
     */
    private async getMatchingChannels(options?: ChannelSelectionOptions): Promise<ChannelInfo[]> {
        if (options && options.channelId && options.channelIds) {
            throw new Error(
                'You cannot specify channelId and channelIds at the same time in query options!'
            );
        }
        if (options && options.owner && options.owners) {
            throw new Error(
                'You cannot specify owner and owners at the same time in query options!'
            );
        }
        if (options && options.channelHash && options.channelHashes) {
            throw new Error(
                'You cannot specify channelHash and channelHashes at the same time in query options!'
            );
        }

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

        // Map options.channelHash(es) to a single variable
        let channelHashes: SHA256Hash<ChannelInfo>[] | null = null;
        if (options && options.channelHash) {
            channelHashes = [options.channelHash];
        }
        if (options && options.channelHashes) {
            channelHashes = options.channelHashes;
        }

        // If we get specific channel hashes in the options, then use them instead of the registry
        let allChannelInfos: ChannelInfo[];
        if (channelHashes) {
            allChannelInfos = await Promise.all(
                channelHashes.map(channelHash => getObject(channelHash))
            );
        } else {
            allChannelInfos = Array.from(this.channelInfoCache.values()).map(
                elem => elem.latestMergedVersion
            );
        }

        // Filter channel infos based on owners / channelIds
        return allChannelInfos.filter(channelInfo => {
            if (channelIds && !channelIds.includes(channelInfo.id)) {
                return false;
            }
            if (owners && !owners.includes(channelInfo.owner)) {
                return false;
            }
            return true;
        });
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

    // ######## Get data from channels - Array based ########

    /**
     * Get all data from one or multiple channels.
     *
     * Not the behaviour when using ascending ordering (default) and count.
     * It will return the 'count' latest elements in ascending order, not the
     * 'count' oldest elements. It is counter intuitive and should either
     * be fixed or the iterator interface should be the mandatory (and only interface)
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
     * @param {string}  channelId - The id of the channel to read from
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
     * @param {QueryOptions} queryOptions
     */
    public async getObjectById(id: string): Promise<ObjectData<OneUnversionedObjectTypes>> {
        // Collect all information necessary so that we can use the iterator
        const {channelInfoIdHash, channelEntryHash} = ChannelManager.decodeEntryId(id);
        const channelInfo = (await getObjectByIdHash(channelInfoIdHash)).obj;

        // return the object by using the iterator (it formats everything right)
        return (
            await ChannelManager.channelDataIterator({
                $type$: channelInfo.$type$,
                id: channelInfo.id,
                owner: channelInfo.owner,
                head: channelEntryHash
            }).next()
        ).value;
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
    ): Promise<ObjectData<OneUnversionedObjectInterfaces[T]>> {
        function hasRequestedType(
            obj: ObjectData<OneUnversionedObjectTypes>
        ): obj is ObjectData<OneUnversionedObjectInterfaces[T]> {
            return obj.data.$type$ === type;
        }

        // Collect all information necessary so that we can use the iterator
        const {channelInfoIdHash, channelEntryHash} = ChannelManager.decodeEntryId(id);
        const channelInfo = (await getObjectByIdHash(channelInfoIdHash)).obj;

        // Get the object by using the iterator (it formats everything right)
        const obj = (
            await ChannelManager.channelDataIterator({
                $type$: channelInfo.$type$,
                id: channelInfo.id,
                owner: channelInfo.owner,
                head: channelEntryHash
            }).next()
        ).value;

        // Check the type
        if (!hasRequestedType(obj)) {
            throw new Error(`The referenced object does not have the expected type ${type}`);
        }

        return obj;
    }

    // ######## Access stuff ########

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
