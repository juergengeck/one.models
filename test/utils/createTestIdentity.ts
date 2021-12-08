import tweetnacl from 'tweetnacl';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Keys, Person, Plan} from '@refinio/one.core/lib/recipes';
import {storeVersionedObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {fromByteArray} from 'base64-js';

const DUMMY_PLAN_HASH =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

/**
 * Create a new identity with public & private keys
 *
 * This will generate a Person, and a Keys object with the person set as owner.
 * @param email - The email used for the person object.
 */
export async function createTestIdentity(email: string): Promise<{
    keyPair: tweetnacl.BoxKeyPair;
    signKeyPair: tweetnacl.SignKeyPair;
    person: SHA256IdHash<Person>;
    keys: SHA256Hash<Keys>;
}> {
    const keyPair = tweetnacl.box.keyPair();
    const signKeyPair = tweetnacl.sign.keyPair();
    const personResult = await storeVersionedObject(
        {
            $type$: 'Person',
            email
        },
        DUMMY_PLAN_HASH
    );
    if (personResult.status !== 'new') {
        throw new Error('The person with the specified ID already exists.');
    }
    const keys = (
        await storeUnversionedObject({
            $type$: 'Keys',
            owner: personResult.idHash,
            publicKey: fromByteArray(keyPair.publicKey),
            publicSignKey: fromByteArray(signKeyPair.publicKey)
        })
    ).hash;

    return {
        keyPair,
        signKeyPair,
        person: personResult.idHash,
        keys
    };
}
