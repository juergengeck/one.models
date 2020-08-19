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
import {Profile, SHA256IdHash, Contact, SHA256Hash} from '@OneCoreTypes';

/**
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {SHA256IdHash<Profile>} latestProfile
 * @return {Promise<VersionedObjectResult<Profile>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    latestProfile: SHA256IdHash<Profile>
): Promise<VersionedObjectResult<Profile>> {
    const latestProfileObject = await getObjectByIdHash(latestProfile);
    let contacts: SHA256Hash<Contact>[] = [];
    const versions = await getAllVersionMapEntries(latestProfile);
    for (const versionMapEntry of versions) {
        const currentProfileVersion = await getObject(versionMapEntry.hash);
        contacts = contacts.concat(currentProfileVersion.contactObjects);
    }

    latestProfileObject.obj.contactObjects = [...new Set(contacts)];
    return await WriteStorage.storeVersionedObject(latestProfileObject.obj);
}
