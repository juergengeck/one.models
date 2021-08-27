/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {getObjectWithType} from 'one.core/lib/storage';
import type {VersionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {getInstanceOwnerIdHash, getInstanceIdHash} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import type {ContactApp} from '../src/recipes/ContactRecipes';

/**
 * @description Pure plan for initialising the contact structure <-> used only on the very start
 * of the instance
 *
 * @param WriteStorage
 * @param url
 * @param [takeOver]
 * @returns
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    url: string,
    takeOver?: boolean
): Promise<VersionedObjectResult<ContactApp>> {
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

    const contactObject = await WriteStorage.storeUnversionedObject({
        $type$: 'Contact',
        personId: personIdHash,
        communicationEndpoints: [instanceEndpoint.hash],
        contactDescriptions: []
    });

    const profileObject = await WriteStorage.storeVersionedObject({
        $type$: 'Profile',
        personId: personIdHash,
        mainContact: contactObject.hash,
        contactObjects: [contactObject.hash]
    });

    const someoneObject = await WriteStorage.storeUnversionedObject({
        $type$: 'Someone',
        mainProfile: profileObject.idHash,
        profiles: [profileObject.idHash]
    });

    return await WriteStorage.storeVersionedObject({
        $type$: 'ContactApp',
        appId: 'ContactApp',
        me: someoneObject.hash,
        contacts: []
    });
}
