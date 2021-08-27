import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {ChannelEntry, ChannelInfo} from '../src/recipes/ChannelRecipes';
import type {Person} from 'one.core/lib/recipes';

/**
 * Gives a channel a new head pointer.
 *
 * This is required by the merge algorithm to write a new merged version.
 *
 * Attention: This is a pure plan. Note that running it with versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
 *            will not prevent new unnecessary versions if the old head has the same value. The reason is, that
 *            the old head was most likely generated not through this plan, but by other plans like
 *            - the chum plan
 *            - the channelPost plan
 *
 * @param WriteStorage
 * @param channelId - Id of the channel for which to set the head
 * @param channelOwner - Id of the owner for which to set the head
 * @param head - The new head of the channel
 * @returns
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    channelOwner: SHA256IdHash<Person>,
    head: SHA256Hash<ChannelEntry>
): Promise<VersionedObjectResult<ChannelInfo>> {
    return WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: channelOwner,
        head: head
    });
}
