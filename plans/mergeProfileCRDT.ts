/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {ProfileCRDT, SHA256Hash} from '@OneCoreTypes';

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
    profile: ProfileCRDT,
    baseProfileHash: SHA256Hash<ProfileCRDT>
): Promise<VersionedObjectResult<ProfileCRDT>> {
    console.log('CRDT MERGE');
    /** Create the profile **/
    return await WriteStorage.storeVersionedObjectCRDT(profile, baseProfileHash);
}
