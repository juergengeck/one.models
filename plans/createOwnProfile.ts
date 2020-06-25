/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    getObjectByIdObj,
    getObjectWithType,
    VersionedObjectResult,
    WriteStorageApi
} from 'one.core/lib/storage';
import {Profile} from '@OneCoreTypes';
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
    secret: string
): Promise<VersionedObjectResult<Profile>> {
    /** it is also creating the person object, instance object and keys object **/
    const createdInstance = await WriteStorage.createSingleObjectThroughImpureSubPlan(
        {module: '@one/instance-creator'},
        {
            name: email,
            email,
            secret
        }
    );

    const personIdHash = (await getObjectByIdObj({$type$: 'Person', email})).idHash;
    const instanceIdHash = createdInstance.idHash;

    /** Get the corresponding key links **/
    const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
    const instanceKeyLink = await getAllValues(instanceIdHash, true, 'Keys');
    /** Person key **/
    const personPubEncryptionKeys = await getObjectWithType(personKeyLink[0].toHash, 'Keys');
    const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);
    /** Instance key **/
    const instancePubEncryptionKeys = await getObjectWithType(instanceKeyLink[0].toHash, 'Keys');
    const instancePubEncryptionKeysHash = await calculateHashOfObj(instancePubEncryptionKeys);

    /** Create the structure **/
    const instanceEndpoint = await WriteStorage.storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personIdHash,
        personKeys: personPubEncryptionKeysHash,
        instanceKeys: instancePubEncryptionKeysHash
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
