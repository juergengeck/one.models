// ######## Person key verification #######

import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {createCryptoAPI, CryptoAPI} from '@refinio/one.core/lib/instance-crypto';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type Connection from '../../Connection/Connection';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import type {Person} from '@refinio/one.core/lib/recipes';
import tweetnacl from 'tweetnacl';
import {getIdObject, getObjectWithType} from '@refinio/one.core/lib/storage';
import type InstancesModel from '../../../models/InstancesModel';
import {sendPeerMessage, waitForPeerMessage} from './CommunicationInitiationProtocolMessages';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import {storeIdObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';

/**
 * This process exchanges and verifies person keys.
 *
 * The verification checks the following:
 * - Does the peer have the private key to the corresponding public key
 * - Does the peer use the same key as the last time (key lookup in storage)
 *   -> skipped if
 * - Does the person id communicated by the peer match the expected person id
 *   -> Only checked if matchRemotePersonId is specified
 *
 * @param instancesModel
 * @param conn - The connection used to exchange this data
 * @param localPersonId - The local person id (used for getting keys)
 * @param initiatedLocally
 * @param matchRemotePersonId - It is verified that the transmitted person id matches this one.
 * @param skipLocalKeyCompare - Skips the comparision of local keys. Defaults to false. Use
 *                              with care!
 * @returns
 */
export async function verifyAndExchangePersonId(
    instancesModel: InstancesModel,
    conn: Connection,
    localPersonId: SHA256IdHash<Person>,
    initiatedLocally: boolean,
    matchRemotePersonId?: SHA256IdHash<Person>,
    skipLocalKeyCompare?: boolean
): Promise<{
    isNew: boolean;
    personId: SHA256IdHash<Person>;
    personPublicKey: Uint8Array;
}> {
    // Initialize the crypto stuff
    const instanceHash = await instancesModel.localInstanceIdForPerson(localPersonId);
    const crypto = createCryptoAPI(instanceHash);

    // Get my own person key and id
    const localPersonKeyReverse = await getAllEntries(localPersonId, 'Keys');
    const localPersonKeys = await getObjectWithType(
        localPersonKeyReverse[localPersonKeyReverse.length - 1],
        'Keys'
    );
    const localPersonIdObject = await getIdObject(localPersonId);

    // Exchange person keys
    await sendPeerMessage(conn, {
        command: 'keys_object',
        obj: localPersonKeys
    });
    const remotePersonKeys = (await waitForPeerMessage(conn, 'keys_object')).obj;
    const remotePersonKey = hexToUint8Array(remotePersonKeys.publicKey);

    // Exchange person objects
    await sendPeerMessage(conn, {
        command: 'person_id_object',
        obj: localPersonIdObject
    });
    const remotePersonIdObject = (await waitForPeerMessage(conn, 'person_id_object')).obj;
    const remotePersonId = await calculateIdHashOfObj(remotePersonIdObject);

    // Sanity check the keys object
    if (remotePersonKeys.owner !== remotePersonId) {
        throw new Error('Received keys object does not belong to the transmitted person id object');
    }

    // Challenge remote person keys and respond to challenge for own keys
    if (initiatedLocally) {
        await challengePersonKey(conn, remotePersonKey, crypto);
        await challengeRespondPersonKey(conn, remotePersonKey, crypto);
    } else {
        await challengeRespondPersonKey(conn, remotePersonKey, crypto);
        await challengePersonKey(conn, remotePersonKey, crypto);
    }

    // Verify that the remote person id is the same as the one we have from the callback
    if (matchRemotePersonId && remotePersonId !== matchRemotePersonId) {
        throw new Error('The person id does not match the one we have on record.');
    }

    // Verify that the transmitted key matches the one we already have
    let keyComparisionFailed: boolean = true;
    try {
        // Lookup key objects of the person he claims to be
        const remotePersonKeyReverse = await getAllEntries(remotePersonId, 'Keys');
        if (!remotePersonKeyReverse || remotePersonKeyReverse.length === 0) {
            await storeIdObject(remotePersonIdObject);
            await storeUnversionedObject(remotePersonKeys);
            console.log('localPerson', localPersonId, localPersonIdObject);
            console.log('remotePerson', remotePersonId, remotePersonIdObject);

            // This means that we have no key belonging to this person
            return {
                isNew: true,
                personId: remotePersonId,
                personPublicKey: remotePersonKey
            };
        }

        // Load the stored key from storage
        const remotePersonKeyStored = (
            await getObjectWithType(
                remotePersonKeyReverse[remotePersonKeyReverse.length - 1],
                'Keys'
            )
        ).publicKey;

        // Compare the key to the transmitted one
        if (uint8arrayToHexString(remotePersonKey) === remotePersonKeyStored) {
            keyComparisionFailed = false;
        }
    } catch (e) {
        await storeIdObject(remotePersonIdObject);
        await storeUnversionedObject(remotePersonKeys);
        console.log('localPerson', localPersonId, localPersonIdObject);
        console.log('remotePerson', remotePersonId, remotePersonIdObject);

        // This means that we have not encountered the person, yet.
        return {
            isNew: true,
            personId: remotePersonId,
            personPublicKey: remotePersonKey
        };
    }

    // Throw error when key comparison failed.
    if (keyComparisionFailed && !skipLocalKeyCompare) {
        throw new Error('Key does not match your previous visit');
    }

    // Store the objects

    // If we made it to here, then everything checked out => person is authenticated against the stored data
    return {
        isNew: false,
        personId: remotePersonId,
        personPublicKey: remotePersonKey
    };
}

/**
 * Challenge the remote peer for proving that he has the private key
 *
 * @param conn
 * @param remotePersonPublicKey
 * @param crypto
 */
async function challengePersonKey(
    conn: Connection,
    remotePersonPublicKey: Uint8Array,
    crypto: CryptoAPI
): Promise<void> {
    // Send the challenge
    const challenge = tweetnacl.randomBytes(64);
    const encryptedChallenge = crypto.encryptWithPersonPublicKey(remotePersonPublicKey, challenge);
    await conn.send(encryptedChallenge);
    for (let i = 0; i < challenge.length; ++i) {
        challenge[i] = ~challenge[i];
    }

    // Wait for response
    const encryptedResponse = await conn.promisePlugin().waitForBinaryMessage();
    const response = crypto.decryptWithPersonPublicKey(remotePersonPublicKey, encryptedResponse);
    if (!tweetnacl.verify(challenge, response)) {
        conn.close();
        throw new Error('Failed to authenticate connection.');
    }
}

/**
 * Wait for a challenge and prove that we have the private key.
 *
 * @param conn
 * @param remotePersonPublicKey
 * @param crypto
 */
async function challengeRespondPersonKey(
    conn: Connection,
    remotePersonPublicKey: Uint8Array,
    crypto: CryptoAPI
): Promise<void> {
    // Wait for challenge
    const encryptedChallenge = await conn.promisePlugin().waitForBinaryMessage();
    const challenge = crypto.decryptWithPersonPublicKey(remotePersonPublicKey, encryptedChallenge);
    for (let i = 0; i < challenge.length; ++i) {
        challenge[i] = ~challenge[i];
    }
    const encryptedResponse = crypto.encryptWithPersonPublicKey(remotePersonPublicKey, challenge);
    await conn.send(encryptedResponse);
}
