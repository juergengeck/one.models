/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {getObjectByIdObj, getObjectWithType} from 'one.core/lib/storage';
import type {WriteStorageApi, VersionedObjectResult} from 'one.core/lib/storage';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Instance} from 'one.core/lib/recipes';
import type {Profile} from '../src/recipes/ContactRecipes';

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
    email: string,
    instanceIdHash: SHA256IdHash<Instance>,
    contactObjUrl: string,
    takeOver?: boolean
): Promise<VersionedObjectResult<Profile>> {
    const personIdHash = (await getObjectByIdObj({$type$: 'Person', email})).idHash;

    /** Person key **/
    const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
    const personPubEncryptionKeys = await getObjectWithType(
        personKeyLink[personKeyLink.length - 1].toHash,
        'Keys'
    );
    const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);

    /** Instance key **/
    const instanceKeyLink = await getAllValues(instanceIdHash, true, 'Keys');
    const instancePubEncryptionKeys = await getObjectWithType(
        instanceKeyLink[instanceKeyLink.length - 1].toHash,
        'Keys'
    );
    const instancePubEncryptionKeysHash = await calculateHashOfObj(instancePubEncryptionKeys);

    /** Create the structure **/
    const instanceEndpoint = await WriteStorage.storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personIdHash,
        instanceId: instanceIdHash,
        personKeys: takeOver ? undefined : personPubEncryptionKeysHash,
        instanceKeys: instancePubEncryptionKeysHash,
        url: contactObjUrl
    });

    const contactObject = await WriteStorage.storeUnversionedObject({
        $type$: 'Contact',
        personId: personIdHash,
        communicationEndpoints: [instanceEndpoint.hash],
        contactDescriptions: []
    });

    return await WriteStorage.storeVersionedObject({
        $type$: 'Profile',
        personId: personIdHash,
        mainContact: contactObject.hash,
        contactObjects: [contactObject.hash]
    });
}
