import {
    getObject,
    getObjectByIdHash,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {OneUnversionedObjectTypes, SHA256IdHash, ChannelInfo, Person} from '@OneObjectInterfaces';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

/**
 * Post a new entry in a channel.
 *
 * This creates a new channel entry with the current time as creation time and
 * inserts it to the channel.
 *
 * Attention: This is an impure plan, because it always generates a new element
 *            with a new creation time even if the payload was posted before
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} channelId - The channel to post to
 * @param {SHA256IdHash<Person>} channelOwner - Owner of the channel to post to
 * @param {OneUnversionedObjectTypes} payload - Payload of the post
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    channelOwner: SHA256IdHash<Person>,
    payload: OneUnversionedObjectTypes,
    timestamp?: number
): Promise<VersionedObjectResult<ChannelInfo>> {
    // Get the latest ChannelInfo from the database
    let latestChannelInfo;
    {
        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: channelId,
            owner: channelOwner
        });
        latestChannelInfo = (await getObjectByIdHash<ChannelInfo>(channelInfoIdHash)).obj;
    }

    // Get the creation time of the last element
    let previousCreationTime = 0;
    if (latestChannelInfo.head) {
        const channelEntry = await getObject(latestChannelInfo.head);
        const creationTimeObj = await getObject(channelEntry.data);
        previousCreationTime = creationTimeObj.timestamp;
    }

    // Write the payload.
    // If it already exists, then ... it doesn't matter, because it will have the same hash
    const payloadResult = await WriteStorage.storeUnversionedObject(payload);

    // Write creation time meta information
    const creationTimeResult = await WriteStorage.storeUnversionedObject({
        $type$: 'CreationTime',
        timestamp: timestamp ? timestamp : Date.now(),
        data: payloadResult.hash
    });

    // If the creation time of the previous entry is larger, it means that the clock of one of the
    // participating devices is wrong. We can't then just set the new element as new head, because
    // this would invalidate the assumption that all items are sorted by creation time.
    // In this special case we need to insert the element at the correct position in the chain by
    // iterating and rebuilding the chain after the correct insertion point.
    // The merge algorithm does exactly that, so we just post a new version with exactly one element
    // (=> undefined previous element) and let the merge algorithm take care of the iteration.
    let previousPointer;
    if (creationTimeResult.obj.timestamp > previousCreationTime) {
        previousPointer = latestChannelInfo.head;
    } else {
        previousPointer = undefined;
    }

    // Write the channel entry
    const channelEntryResult = await WriteStorage.storeUnversionedObject({
        $type$: 'ChannelEntry',
        previous: previousPointer,
        data: creationTimeResult.hash
    });

    // Write the channel info with the new channel entry as head
    return WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: channelOwner,
        head: channelEntryResult.hash
    });
}
