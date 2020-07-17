/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getObjectByIdObj,
    getObjectWithType,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {Profile, SHA256IdHash, Instance} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateHashOfObj} from 'one.core/lib/util/object';

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
    contactObjUrl: string
): Promise<VersionedObjectResult<Profile>> {

    const personIdHash = (await getObjectByIdObj({$type$: 'Person', email})).idHash;

    /** Person key **/
    const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
    const personPubEncryptionKeys = await getObjectWithType(personKeyLink[0].toHash, 'Keys');
    const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);

    /** Instance key **/
    const instanceKeyLink = await getAllValues(instanceIdHash, true, 'Keys');
    const instancePubEncryptionKeys = await getObjectWithType(instanceKeyLink[0].toHash, 'Keys');
    const instancePubEncryptionKeysHash = await calculateHashOfObj(instancePubEncryptionKeys);

    /** Create the structure **/
    const instanceEndpoint = await WriteStorage.storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personIdHash,
        instanceId: instanceIdHash,
        personKeys: personPubEncryptionKeysHash,
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
