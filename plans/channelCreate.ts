import {getObjectByIdHash, SET_ACCESS_MODE, SetAccessParam} from '@refinio/one.core/lib/storage';
import type {WriteStorageApi, VersionedObjectResult} from '@refinio/one.core/lib/storage';
import {getInstanceIdHash} from '@refinio/one.core/lib/instance';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import type {ChannelInfo} from '../src/recipes/ChannelRecipes';

/**
 * Create a channel by writing a ChannelInfo object with an empty head.
 *
 * Note: Access rights for the the instance owner (not the channel owner) are set
 *       on the channel.
 * TODO: Think about whether giving access to the instance owner by default is the right approach
 * TODO: Think about the problem with calling it when the chum already synced channels, but this plan
 *       didn't run, yet. Perhaps a plan is not the correct way to create channels!
 *
 * Attention: This is a pure plan. It is designed to not run, when it was run once for a
 *            channelId / channelOwner combination. The return value will not be very useful
 *            for this plan, because it will always return a ChannelInfo object without a
 *            head pointer.
 *            In the case that there already exists such a channel but the plan hasn't been executed
 *            locally it will create a new version without any elements! The merge algorithm will
 *            then take care of this. This might happen if the chum was started before a channel was
 *            created and other instances sync their channel versions.
 *
 * @param WriteStorage
 * @param channelId - Name of the channel
 * @param channelOwner - Owner of the channel
 * @returns
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelId: string,
    channelOwner: SHA256IdHash<Person>
): Promise<VersionedObjectResult<ChannelInfo>> {
    // Update the head of the ChannelInfo entry
    const channelInfoResult = await WriteStorage.storeVersionedObject({
        $type$: 'ChannelInfo',
        id: channelId,
        owner: channelOwner
    });

    // Set access rights for myself
    const instanceIdHash = getInstanceIdHash();
    if (instanceIdHash) {
        const instanceResult = await getObjectByIdHash(instanceIdHash);
        const setAccessParam: SetAccessParam = {
            group: [],
            id: channelInfoResult.idHash,
            mode: SET_ACCESS_MODE.REPLACE,
            person: [instanceResult.obj.owner]
        };
        await WriteStorage.createSingleObjectThroughPureSubPlan({module: '@one/access'}, [
            setAccessParam
        ]);
    }

    return channelInfoResult;
}
