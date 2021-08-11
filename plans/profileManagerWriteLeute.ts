import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {Leute} from '../lib/recipes/LeuteRecipes/Leute';
import type {Someone} from '../lib/recipes/LeuteRecipes/Someone';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

/**
 * Plan for writing a profile object.
 *
 * This plan writes all endpoint objects, assigns them to the profile object and then writes the
 * profile object.
 *
 * @param WriteStorage
 * @param me
 * @param others
 * @param basePeopleVersion
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    me: SHA256IdHash<Someone>,
    others: Set<SHA256IdHash<Someone>>,
    basePeopleVersion?: SHA256Hash<Leute>
): Promise<VersionedObjectResult<Leute>> {
    // Write the new people version
    return await WriteStorage.storeVersionedObjectCRDT(
        {
            $type$: 'Leute',
            appId: 'one.leute',
            me,
            other: [...others]
        },
        basePeopleVersion
    );
}
