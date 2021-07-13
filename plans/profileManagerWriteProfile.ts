/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {Person, SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import type {Profile} from 'one.models/lib/recipes/PeopleModel/Profile';
import {CommunicationEndpointTypes} from '../src/recipes/PeopleRecipes/CommunicationEndpoints';
import {ContactDescriptionTypes} from '../src/recipes/PeopleRecipes/PersonDescriptions';

/**
 * @description Pure plan for creating a profile for yourself
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
