/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {SHA256Hash} from '@OneCoreTypes';
import type ProfileModel from 'one.models/lib/models/PeopleModel/Profile';
import type {Profile} from 'one.models/lib/recipes/PeopleModel/Profile';

/**
 * @description Pure plan for creating a profile for yourself
 *
 * @param WriteStorage
 * @param profile
 * @param baseProfileHash
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    profile: ProfileModel,
    baseProfileHash?: SHA256Hash<Profile>
): Promise<VersionedObjectResult<Profile>> {
    // Write endpoint and description objects
    const epHashes = await Promise.all(
        profile.communicationEndpoints.map(ep => WriteStorage.storeUnversionedObject(ep))
    );
    const descHashes = await Promise.all(
        profile.contactDescriptions.map(desc => WriteStorage.storeUnversionedObject(desc))
    );

    // Write the new profile version
    return await WriteStorage.storeVersionedObjectCRDT(
        {
            $type$: 'Profile',
            profileId: profile.profileId,
            personId: profile.personId,
            owner: profile.owner,
            communicationEndpoints: epHashes,
            descHashes: descHashes
        },
        baseProfileHash
    );
}
