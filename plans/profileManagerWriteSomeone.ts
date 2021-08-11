import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {Profile} from '../lib/recipes/LeuteRecipes/Profile';
import type {Someone} from '../lib/recipes/LeuteRecipes/Someone';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

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
            profile: [...profileIds]
        });
    }

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
