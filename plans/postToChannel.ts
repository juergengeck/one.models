import {
    getObject,
    getObjectByIdHash,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {
    OneUnversionedObjectTypes,
    SHA256IdHash,
    UnversionedObjectResult,
    ChannelEntry,
    ChannelInfo,
    Person
} from '@OneCoreTypes';
import {calculateHashOfObj, calculateIdHashOfObj} from 'one.core/lib/util/object';

/**
 * Create a new questionnaire entry in the passed channel
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} channelId
 * @param {SHA256IdHash<Person>} owner
 * @param {OneUnversionedObjectTypes} payload
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    owner: SHA256IdHash<Person>,
    payload: OneUnversionedObjectTypes
): Promise<VersionedObjectResult<ChannelInfo>> {
    // Get the ChannelInfo from the database
    const channelInfoIdHash: SHA256IdHash<ChannelInfo> = await calculateIdHashOfObj({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: owner
    });
    const channelInfoResult = await getObjectByIdHash<ChannelInfo>(channelInfoIdHash);

    const payloadHash = await calculateHashOfObj(payload);
    try {
        await getObject(payloadHash);
    } catch (e) {
        await WriteStorage.storeUnversionedObject(payload);
    }

    // Create payload
    // Create creation time meta information
    const creationTimeResult = await WriteStorage.storeUnversionedObject({
        $type$: 'CreationTime',
        timestamp: Date.now(),
        data: payloadHash
    });

    // Create the channel entry
    // We should iterate the linked list until the correct item is found ... later when we have time
    // assume all clocks are in sync at the moment
    const channelEntryResult = (await WriteStorage.storeUnversionedObject({
        $type$: 'ChannelEntry',
        previous: channelInfoResult.obj.head,
        data: creationTimeResult.hash
    })) as UnversionedObjectResult<ChannelEntry>;

    // Update the head of the ChannelInfo entry
    return await WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: owner,
        head: channelEntryResult.hash
    });
}
