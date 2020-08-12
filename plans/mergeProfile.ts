/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {getObject, getObjectByIdHash, VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {Profile, SHA256IdHash} from '@OneCoreTypes';
import {getNthVersionMapHash} from 'one.core/lib/version-map-query';

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
    const firstPreviousProfileObject = await getObject(
        await getNthVersionMapHash(latestProfile, -1)
    );
    const secondPreviousProfileObject = await getObject(
        await getNthVersionMapHash(latestProfile, -2)
    );
    latestProfile.obj.contactObjects = [
        ...new Set([
            ...latestProfileObject.obj.contactObjects,
            ...firstPreviousProfileObject.contactObjects,
            ...secondPreviousProfileObject.contactObjects
        ])
    ];
    return await WriteStorage.storeVersionedObject(latestProfile.obj);
}
