/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getAllVersionMapEntries,
    getObject,
    getObjectByIdHash,
    VersionedObjectResult
} from 'one.core/lib/storage';
import type {WriteStorageApi} from 'one.core/lib/storage';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Contact, Profile} from '../src/recipes/ContactRecipes';

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
