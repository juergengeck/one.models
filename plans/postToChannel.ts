import {
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
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

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
    const latestChannelInfo = (await getObjectByIdHash<ChannelInfo>(channelInfoIdHash)).obj;

    // Write the payload. If it already exists, then ... it doesn't matter
    const payloadResult = await WriteStorage.storeUnversionedObject(payload);

    // Write creation time meta information
    const creationTimeResult = await WriteStorage.storeUnversionedObject({
        $type$: 'CreationTime',
        timestamp: Date.now(),
        data: payloadResult.hash
    });

    // Write the channel entry
    // We should iterate the linked list until the correct item is found ... later when we have time
    // assume all clocks are in sync at the moment
    // Or: we write a new channel with one element, and the merge algorithm will merge them correctly
    // otherwise we have to replicate the merge algorithm here!
    const channelEntryResult = await WriteStorage.storeUnversionedObject({
        $type$: 'ChannelEntry',
        previous: latestChannelInfo.head,
        data: creationTimeResult.hash
    });

    // Update the head of the ChannelInfo entry
    return await WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: owner,
        head: channelEntryResult.hash
    });
}
