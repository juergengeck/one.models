/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getAllVersionMapEntries,
    getObject,
    getObjectByIdHash,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {ContactApp, SHA256IdHash, Someone, SHA256Hash} from '@OneObjectInterfaces';

/**
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {SHA256IdHash<Profile>} latestContactApp
 * @return {Promise<VersionedObjectResult<Profile>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    latestContactApp: SHA256IdHash<ContactApp>
): Promise<VersionedObjectResult<ContactApp>> {
    const latestContactAppObject = await getObjectByIdHash(latestContactApp);
    let contacts: SHA256Hash<Someone>[] = [];
    const versions = await getAllVersionMapEntries(latestContactApp);
    for (const versionMapEntry of versions) {
        const currentContactAppVersion = await getObject(versionMapEntry.hash);
        contacts = contacts.concat(currentContactAppVersion.contacts);
    }

    latestContactAppObject.obj.contacts = [...new Set(contacts)];
    return await WriteStorage.storeVersionedObject(latestContactAppObject.obj);
}
