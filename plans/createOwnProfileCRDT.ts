/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getObjectByIdObj,
    getObjectWithType,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {ProfileCRDT, SHA256IdHash, Instance} from '@OneCoreTypes';
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
    profileName: string,
    instanceIdHash: SHA256IdHash<Instance>,
    contactObjUrl: string,
    takeOver?: boolean
): Promise<VersionedObjectResult<ProfileCRDT>> {
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

    /** Create the communication endpoint **/
    const instanceEndpoint = await WriteStorage.storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personIdHash,
        instanceId: instanceIdHash,
        personKeys: takeOver ? undefined : personPubEncryptionKeysHash,
        instanceKeys: instancePubEncryptionKeysHash,
        url: contactObjUrl
    });

    /** Create the profile **/
    return await WriteStorage.storeVersionedObjectCRDT({
        $type$: 'ProfileCRDT',
        personId: personIdHash,
        profileName: profileName,
        author: personIdHash, // the writer is the author
        communicationEndpoints: [instanceEndpoint.hash],
        contactDescriptions: []
    });
}
