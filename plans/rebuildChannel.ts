import {
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {Person, ChannelInfo, ChannelEntry, CreationTime, SHA256Hash, SHA256IdHash} from '@OneCoreTypes';

/**
 * Creates a new channel version by rebuilding the channel.
 *
 * The channel is rebuilt out of old elements that already are in the linked list merkle tree.
 * New elements that need to be added to the linked list structure on top of the old ones.
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {SHA256Hash<ChannelEntry>} history - The history that the new elements will be based on
 * @param {SHA256Hash<CreationTime>[]} newElementsReversed - the new elements, but in reversed order
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    channelOwner: SHA256IdHash<Person>,
    history: SHA256Hash<ChannelEntry>,
    newElementsReversed: SHA256Hash<CreationTime>[]
): Promise<VersionedObjectResult<ChannelInfo>> {
    if (newElementsReversed.length === 0) {
        throw new Error('It does not make sense to rebuild a channel with 0 elements.');
    }

    // Create the new channel entries linked list from the array elements
    let lastChannelEntry = history;
    for (let i = newElementsReversed.length - 1; i >= 0; --i) {
        lastChannelEntry = (
            await WriteStorage.storeUnversionedObject({
                $type$: 'ChannelEntry',
                data: newElementsReversed[i],
                previous: lastChannelEntry
            })
        ).idHash;
    }

    // Create the new channel version
    return WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: channelOwner,
        head: lastChannelEntry
    });
}
