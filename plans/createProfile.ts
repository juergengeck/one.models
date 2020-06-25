/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {Profile} from '@OneCoreTypes';

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
    const personIdHash = (
        await WriteStorage.storeVersionedObject({
            $type$: 'Person',
            email: email
        })
    ).idHash;
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
