import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {
    Person,
    ChannelInfo,
    ChannelEntry,
    CreationTime,
    SHA256Hash,
    SHA256IdHash, UnversionedObjectResult
} from '@OneCoreTypes';

/**
 * Creates a new channel version by rebuilding the channel.
 *
 * The channel is rebuilt out of old elements that already are in the linked list merkle tree.
 * New elements that need to be added to the linked list structure on top of the old ones.
 *
 * Attention: This is a pure plan. It is designed to not run, when it was run with the same old head and
 *            the same list of channel entries. It is okay that it then just returns the new head instead
 *            of running the plan again, because the chain it is supposed to build already exists.
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} channelId
 * @param {SHA256IdHash<Person>} channelOwner
 * @param {SHA256Hash<ChannelEntry>} oldHead - The old head that the new elements will be based on
 * @param {SHA256Hash<CreationTime>[]} newElementsReversed - the new elements, but in reversed order
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    channelOwner: SHA256IdHash<Person>,
    oldHead: SHA256Hash<ChannelEntry>,
    newElementsReversed: SHA256Hash<CreationTime>[]
): Promise<UnversionedObjectResult<ChannelEntry>> {

    // Create the new channel entries linked list from the array elements
    let lastChannelEntry = oldHead;
    let newEntryResult;
    for (let i = newElementsReversed.length - 1; i >= 0; --i) {
        newEntryResult = await WriteStorage.storeUnversionedObject({
            $type$: 'ChannelEntry',
            data: newElementsReversed[i],
            previous: lastChannelEntry
        });
        lastChannelEntry = newEntryResult.hash;
    }

    // If newEntryResult is undefined this means, that the newElementsReserved list was empty
    // Usually we could just return the oldHead, but we need an UnversionedObjectResult from
    // a SHA256Hash<ChannelEntry> and I have no clue how to get it, so throw.
    if (!newEntryResult) {
        throw new Error('It does not make sense to rebuild a channel with 0 elements.');
    }

    // Create the new channel version
    return newEntryResult;
}