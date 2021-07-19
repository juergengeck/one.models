/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {Profile} from '../src/recipes/ContactRecipes';

/**
 * @description Pure plan for creating a profile for another person
 *
 * @param {WriteStorageApi} WriteStorage
 * @param {string} email
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    email: string
): Promise<VersionedObjectResult<Profile>> {
    // Create the person
    const personIdHash = (
        await WriteStorage.storeVersionedObject({
            $type$: 'Person',
            email: email
        })
    ).idHash;

    // Create empty contact object and add it to profile
    const contactObject = await WriteStorage.storeUnversionedObject({
        $type$: 'Contact',
        personId: personIdHash,
        communicationEndpoints: [],
        contactDescriptions: []
    });

    return await WriteStorage.storeVersionedObject({
        $type$: 'Profile',
        personId: personIdHash,
        mainContact: contactObject.hash,
        contactObjects: [contactObject.hash]
    });
}
