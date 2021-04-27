/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {getObjectWithType, VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {CommunicationEndpointTypes, ContactApp, ContactDescriptionTypes} from '@OneCoreTypes';
import {getInstanceOwnerIdHash, getInstanceIdHash} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateHashOfObj} from 'one.core/lib/util/object';

/**
 * @description Pure plan for initialising the contact structure <-> used only on the very start
 * of the instance
 *
 * @param {WriteStorageApi} WriteStorage
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    url: string,
    takeOver?: boolean
): Promise<VersionedObjectResult<ContactApp>> {
    console.log('PLAN-setupInitialProfile');
    /** Get the current person id hash **/
    const personIdHash = getInstanceOwnerIdHash();
    const instanceIdHash = getInstanceIdHash();

    if (!(personIdHash && instanceIdHash)) {
        throw new Error('Error: personIdHash or instanceIdHash is undefined');
    }
    /** Get the corresponding key links **/
    const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
    const instanceKeyLink = await getAllValues(instanceIdHash, true, 'Keys');
    /** Person key **/
    const personPubEncryptionKeys = await getObjectWithType(
        personKeyLink[personKeyLink.length - 1].toHash,
        'Keys'
    );
    const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);
    /** Instance key **/
    const instancePubEncryptionKeys = await getObjectWithType(
        instanceKeyLink[instanceKeyLink.length - 1].toHash,
        'Keys'
    );
    const instancePubEncryptionKeysHash = await calculateHashOfObj(instancePubEncryptionKeys);
    // 1. Decide for which instance -> current instance
    // 2. get the instance hash by ``const instanceIdHash = getInstanceIdHash();``
    // 3. from the reverse map obtain the key object for this instance

    /** Create the structure **/
    const instanceEndpoint = await WriteStorage.storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personIdHash,
        instanceId: instanceIdHash,
        personKeys: takeOver ? undefined : personPubEncryptionKeysHash,
        instanceKeys: instancePubEncryptionKeysHash,
        url
    });

    const prof = {
        $type$: 'ProfileCRDT',
        personId: personIdHash,
        profileName: 'default',
        author: personIdHash, // the writer is the author
        communicationEndpoints: [instanceEndpoint.hash],
        contactDescriptions: []
    };
    console.log('PROFILE TO BE WRITTEN', prof);
    const profileObject = await WriteStorage.storeVersionedObjectCRDT({
        $type$: 'ProfileCRDT',
        personId: personIdHash,
        profileName: 'default',
        author: personIdHash, // the writer is the author
        communicationEndpoints: [instanceEndpoint.hash],
        contactDescriptions: []
    });
    console.log('PLAN-setupInitialProfile3', profileObject);

    const someoneObject = await WriteStorage.storeUnversionedObject({
        $type$: 'Someone',
        mainProfile: profileObject.idHash,
        profiles: [profileObject.idHash]
    });
    console.log('PLAN-setupInitialProfile4', someoneObject);

    return await WriteStorage.storeVersionedObject({
        $type$: 'ContactApp',
        appId: 'ContactApp',
        me: someoneObject.hash,
        contacts: []
    });
}
