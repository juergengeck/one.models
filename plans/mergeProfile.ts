/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getObject,
    getObjectByIdHash,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
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
    let firstPreviousProfileObject: Profile | {contactObjects: []} = {contactObjects: []};
    let secondPreviousProfileObject: Profile | {contactObjects: []} = {contactObjects: []};

    try {
        firstPreviousProfileObject = await getObject(await getNthVersionMapHash(latestProfile, -1));
    } catch (_) {}

    try {
        secondPreviousProfileObject = await getObject(
            await getNthVersionMapHash(latestProfile, -2)
        );
    } catch (_) {}

    latestProfileObject.obj.contactObjects = [
        ...new Set([
            ...latestProfileObject.obj.contactObjects,
            ...firstPreviousProfileObject.contactObjects,
            ...secondPreviousProfileObject.contactObjects
        ])
    ];
    return await WriteStorage.storeVersionedObject(latestProfileObject.obj);
}
