import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {Person, SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import type {Profile} from '../src/recipes/LeuteRecipes/Profile';
import {Someone} from '../src/recipes/LeuteRecipes/Someone';

/**
 * Plan for writing a profile object.
 *
 * This plan writes all endpoint objects, assigns them to the profile object and then writes the
 * profile object.
 *
 * @param WriteStorage
 * @param someoneId
 * @param mainProfile
 * @param profiles
 * @param baseSomeoneVersion
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    someoneId: string,
    mainProfile: SHA256IdHash<Profile>,
    profiles: Map<SHA256IdHash<Person>, SHA256IdHash<Profile>[]>,
    baseSomeoneVersion?: SHA256Hash<Someone>
): Promise<VersionedObjectResult<Someone>> {
    const identities = [];
    for (const [personId, profileIds] of profiles.entries()) {
        identities.push({
            person: personId,
            profile: profileIds
        });
    }

    // Write the new profile version
    return await WriteStorage.storeVersionedObjectCRDT(
        {
            $type$: 'Someone',
            someoneId,
            mainProfile,
            identity: identities
        },
        baseSomeoneVersion
    );
}
