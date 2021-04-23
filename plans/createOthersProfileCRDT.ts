/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {ProfileCRDT} from '@OneCoreTypes';

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
