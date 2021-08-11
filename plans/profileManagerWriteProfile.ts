import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {Profile} from '../lib/recipes/LeuteRecipes/Profile';
import type {CommunicationEndpointTypes} from '../lib/recipes/LeuteRecipes/CommunicationEndpoints';
import type {ContactDescriptionTypes} from '../lib/recipes/LeuteRecipes/PersonDescriptions';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

/**
 * Plan for writing a profile object.
 *
 * This plan writes all endpoint objects, assigns them to the profile object and then writes the
 * profile object.
 *
 * @param WriteStorage
 * @param profileId
 * @param personId
 * @param owner
 * @param communicationEndpoints
 * @param contactDescriptions
 * @param baseProfileVersion
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    profileId: string,
    personId: SHA256IdHash<Person>,
    owner: SHA256IdHash<Person>,
    communicationEndpoints: CommunicationEndpointTypes[],
    contactDescriptions: ContactDescriptionTypes[],
    baseProfileVersion?: SHA256Hash<Profile>
): Promise<VersionedObjectResult<Profile>> {
    // Write endpoint and description objects
    const epHashes = await Promise.all(
        communicationEndpoints.map(ep => WriteStorage.storeUnversionedObject(ep))
    );
    const descHashes = await Promise.all(
        contactDescriptions.map(desc => WriteStorage.storeUnversionedObject(desc))
    );

    // Write the new profile version
    return await WriteStorage.storeVersionedObjectCRDT(
        {
            $type$: 'Profile',
            profileId,
            personId,
            owner,
            communicationEndpoint: epHashes.map(ep => ep.hash),
            contactDescription: descHashes.map(desc => desc.hash)
        },
        baseProfileVersion
    );
}
