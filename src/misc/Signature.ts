import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Keys, OneObjectTypes, Person, Plan} from '@refinio/one.core/lib/recipes';
import {getInstanceIdHash, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';
import {getObject, getObjectByIdHash, getObjectWithType} from '@refinio/one.core/lib/storage';
import {createCryptoAPI} from '@refinio/one.core/lib/instance-crypto';
import {getAllValues} from '@refinio/one.core/lib/reverse-map-query';
import hexToArrayBuffer, {arrayBufferToHex} from './ArrayBufferHexConvertor';
import {getMetaObjectsOfType, storeMetaObject} from './MetaObjectMap';
import tweetnacl from 'tweetnacl';
import type {Signature} from '../recipes/SignatureRecipes';
import {toByteArray} from 'base64-js';

/**
 * Sign an object with my own key.
 *
 * @param data - The data which to sign.
 */
export async function sign(data: SHA256Hash): Promise<void> {
    // Load instance
    // This is only required, because the cryptoAPI is constructed from the instance and the issued is determined
    // this way at the moment. We need to change that!
    const instanceIdHash = await getInstanceIdHash();

    if (instanceIdHash === undefined) {
        throw new Error('Instance is not initialized');
    }

    const instance = (await getObjectByIdHash(instanceIdHash)).obj;

    // Sign the message with the crypto API
    // TODO: Do we need to include the issuer? The keymanagement (leute) should be able to verify that
    //       a key belongs to a certain person (the issuer). So we have to make sure that it does, then
    //       it is not a problem.
    //       A: It isn't necessary, because the issuer is just a hint which public key to use. Everything
    //          would work just fine without the issuer, because we could find who this key belongs to by
    //          testing all known public keys known to us.
    const cryptoAPI = createCryptoAPI(instanceIdHash);
    const signatureBinary = cryptoAPI.createSignature(new TextEncoder().encode(data));
    const signatureString = arrayBufferToHex(signatureBinary.buffer);

    // Store the signature as meta object.
    await storeMetaObject(data, {
        $type$: 'Signature',
        issuer: instance.owner,
        data: data,
        signature: signatureString
    });
}

/**
 * Verify a signature.
 *
 * This also includes, that the key belongs to the mentioned issuer.
 *
 * @param data
 * @param issuer
 */
export async function isSignedBy(
    data: SHA256Hash,
    issuer: SHA256IdHash<Person>
): Promise<boolean> {
    return verifySignaturesLowLevel(await trustedKeys(issuer), await signatures(data, issuer));
}

/**
 * Check if an object is signed by me.
 *
 * @param data - the data for which to check whether it is signed.
 */
export async function isSignedByMe(data: SHA256Hash): Promise<boolean> {
    return isSignedBy(data, await myId());
}

// ######## Private signature stuff ########

/**
 * Get all signatures that exist for the passed object.
 *
 * @param data - signatures for this object are returned.
 * @param issuer - If specified only return signatures for this issuer.
 */
async function signatures(data: SHA256Hash, issuer?: SHA256IdHash<Person>): Promise<Signature[]> {
    const signatureObjects = await getMetaObjectsOfType(data, 'Signature');
    if (issuer === undefined) {
        return signatureObjects;
    } else {
        return signatureObjects.filter(sig => sig.issuer === issuer);
    }
}

/**
 * Filter out all elements that are not signed by me.
 *
 * @param data - The array of elements to filter
 * @returns - The array of elements that only has signed by me elements left.
 */
async function filterSignedByMe<T extends OneObjectTypes>(
    data: SHA256Hash<T>[]
): Promise<SHA256Hash<T>[]> {
    const key = await myKey();

    // Map from 'data' to '{data, signatures}' format
    const container = await Promise.all(
        data.map(async d => {
            return {
                data: d,
                signatures: await signatures(d, key.owner as SHA256IdHash<Person>)
            };
        })
    );

    // Filter container based on valid signatures
    const containerSigned = container.filter(c => {
        for (const sig of c.signatures) {
            if (verifySignatureLowLevel(key, sig)) {
                return true;
            }
        }
        return false;
    });

    // Map from '{data, signatures}' to 'data' format
    return containerSigned.map(c => c.data);
}

// ######## Low-Level signature verification ########

/**
 * Checks whether the signature object was created with the specified keys.
 *
 * @param key
 * @param signature
 */
function verifySignatureLowLevel(key: Keys, signature: Signature): boolean {
    if (key.publicSignKey === undefined) {
        throw new Error('Public sign key does not exist.');
    }
    return tweetnacl.sign.detached.verify(
        new TextEncoder().encode(signature.data), // string -> utf8 UInt8Array
        new Uint8Array(hexToArrayBuffer(signature.signature)), // hex string -> UInt8Array (binary)
        toByteArray(key.publicSignKey) // base64 string -> UInt8Array (binary)
    );
}

/**
 * Checks whether any of the signature objects was created with any of the keys.
 *
 * @param keys - The keys to check
 * @param signatures - The signatures to check
 */
function verifySignaturesLowLevel(keys: Keys[], signatures: Signature[]): boolean {
    for (const key of keys) {
        for (const signature of signatures) {
            if (verifySignatureLowLevel(key, signature)) {
                return true;
            }
        }
    }
    return false;
}

// ######## Keymanagement ########

/**
 * Returns a list of keys for that person that I chose to trust by signing them.
 *
 * @param person - The person for which to get trusted keys.
 */
async function trustedKeys(person: SHA256IdHash<Person>): Promise<Keys[]> {
    const keyHashes = await trustedKeyHashes(person);
    return Promise.all(keyHashes.map(keyHash => getObject(keyHash)));
}

/**
 * Returns a list of key hashes for that person that I chose to trust by signing them.
 *
 * @param person - The person for which to get trusted keys.
 */
async function trustedKeyHashes(person: SHA256IdHash<Person>): Promise<SHA256Hash<Keys>[]> {
    const me = await getInstanceOwnerIdHash();
    if (person === me) {
        const reverseMapEntry = await getAllValues(me, true, 'Keys');
        if (reverseMapEntry.length === 0) {
            return [];
        } else {
            return [reverseMapEntry[0].toHash];
        }
    } else {
        const keyHashes = await untrustedKeyHashes(person);
        return filterSignedByMe(keyHashes);
    }
}

/**
 * Returns a list of all known key hashes of a person - including the ones I don't trust.
 *
 * @param person - The person for which to get keys.
 */
async function untrustedKeyHashes(person: SHA256IdHash<Person>): Promise<SHA256Hash<Keys>[]> {
    const reverseMapEntries = await getAllValues(person, true, 'Keys');
    return reverseMapEntries.map(reverseMapEntry => reverseMapEntry.toHash);
}

/**
 * Obtain my own keys object.
 */
async function myKey(): Promise<Keys> {
    const keys = await trustedKeys(await myId());
    if (keys.length === 0) {
        throw new Error('No key for me exists.');
    }

    return keys[0];
}

// ######## Other stuff ########

/**
 * Returns the person id for 'me'
 */
async function myId(): Promise<SHA256IdHash<Person>> {
    const me = await getInstanceOwnerIdHash();
    if (me === undefined) {
        throw new Error('Instance is not initialized');
    }
    return me;
}

