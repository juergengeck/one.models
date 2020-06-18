import {
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    SET_ACCESS_MODE,
    SetAccessParam,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {Instance, ChannelInfo, SHA256IdHash, Person} from '@OneCoreTypes';
import {getInstanceIdHash} from 'one.core/lib/instance';

/**
 * Create a new questionnaire entry in the passed channel
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} channelid - Name of channel
 * @param {SHA256IdHash<Person>} personIdHash
 * @returns {Promise<VersionedObjectResult<ChannelInfo>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    channelid: string,
    personIdHash: SHA256IdHash<Person>
): Promise<VersionedObjectResult<ChannelInfo>> {

    // Update the head of the ChannelInfo entry
    const channelInfoResult: VersionedObjectResult<ChannelInfo> = await WriteStorage.storeVersionedObject(
        {
            type: 'ChannelInfo',
            id: channelid,
            owner: personIdHash
        }
    );

    // Set access rights for myself
    const instanceIdHash = getInstanceIdHash();

    if (instanceIdHash) {
        const instanceResult = await getObjectByIdHash<Instance>(instanceIdHash);

        const setAccessParam: SetAccessParam = {
            group: [],
            id: channelInfoResult.idHash,
            mode: SET_ACCESS_MODE.REPLACE,
            person: [instanceResult.obj.owner]
        };
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
    }

    return channelInfoResult;
}
