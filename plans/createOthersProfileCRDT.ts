/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getObjectByIdObj,
    getObjectWithType,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {ProfileCRDT, SHA256IdHash, Instance} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateHashOfObj} from 'one.core/lib/util/object';

/**
 * @description Pure plan for creating a profile for yourself
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} email
 * @param {string} secret
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    email: string,
    profileName: string
): Promise<VersionedObjectResult<ProfileCRDT>> {
    // Create the person
    const personIdHash = (
        await WriteStorage.storeVersionedObject({
            $type$: 'Person',
            email: email
        })
    ).idHash;

    /** Create the profile **/
    return await WriteStorage.storeVersionedObjectCRDT({
        $type$: 'ProfileCRDT',
        personId: personIdHash,
        profileName: profileName,
        author: personIdHash, // the writer is the author
        communicationEndpoints: [],
        contactDescriptions: []
    });
}
