import {
    getObjectByIdHash,
    SET_ACCESS_MODE,
    SetAccessParam,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {ChannelInfo, SHA256IdHash, Person} from '@OneObjectInterfaces';
import {getInstanceIdHash} from 'one.core/lib/instance';

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
 * @param {WriteStorageApi} WriteStorage
 * @param {string} channelId - Name of the channel
 * @param {SHA256IdHash<Person>} channelOwner - Owner of the channel
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
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
