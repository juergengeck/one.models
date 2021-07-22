import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import {People} from '../src/recipes/PeopleRecipes/People';
import {Someone} from '../src/recipes/PeopleRecipes/Someone';

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
    basePeopleVersion?: SHA256Hash<People>
): Promise<VersionedObjectResult<People>> {
    // Write the new people version
    return await WriteStorage.storeVersionedObjectCRDT(
        {
            $type$: 'People',
            appId: 'People',
            me,
            other: [...others]
        },
        basePeopleVersion
    );
}
