import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Keys, OneObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import {getInstanceIdHash, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';
import {getObject, UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import {createCryptoAPI} from '@refinio/one.core/lib/instance-crypto';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import {addMetaObject, getMetaObjectsOfType} from './MetaObjectMap';
import tweetnacl from 'tweetnacl';
import type {Signature} from '../recipes/SignatureRecipes';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';

/**
 * Sign an object with my own key.
 *
 * @param data - The data which to sign.
 */
export async function sign(data: SHA256Hash): Promise<UnversionedObjectResult<Signature>> {
    // Load instance
    // This is only required, because the cryptoAPI is constructed from the instance and the issued is determined
    // this way at the moment. We need to change that!
    const instanceIdHash = getInstanceIdHash();
    const instanceOwner = getInstanceOwnerIdHash();

    if (instanceIdHash === undefined || instanceOwner === undefined) {
        throw new Error('Instance is not initialized');
    }

    // Sign the data hash with the crypto API
    const cryptoAPI = createCryptoAPI(instanceIdHash);
    const signatureBinary = cryptoAPI.createSignature(new TextEncoder().encode(data));
    const signatureString = uint8arrayToHexString(signatureBinary);

    // Store the signature as meta object.
    const sigResult = await storeUnversionedObject({
        $type$: 'Signature',
        issuer: instanceOwner,
        data: data,
        signature: signatureString
    });
    await addMetaObject(data, sigResult.hash);
    await addMetaObject(instanceOwner, sigResult.hash);

    return sigResult;
}

/**
 * Verify a signature.
 *
 * This also includes, that the key belongs to the mentioned issuer.
 *
 * @param data
 * @param issuer
 */
export async function isSignedBy(data: SHA256Hash, issuer: SHA256IdHash<Person>): Promise<boolean> {
    return verifySignaturesLowLevel(await trustedKeys(issuer), await signatures(data, issuer));
}

/**
 * Return the persons who signed this object (only valid signatures - the rest is dropped)
 *
 * @param data
 */
export async function signedBy(data: SHA256Hash): Promise<SHA256IdHash<Person>[]> {
    const sigs = await signatures(data);

    // Create map from issuer to signatures
    const sigMapPerIssuer = new Map<SHA256IdHash<Person>, Signature[]>();
    for (const sig of sigs) {
        const issuerSigs = sigMapPerIssuer.get(sig.issuer);
        if (issuerSigs === undefined) {
            sigMapPerIssuer.set(sig.issuer, [sig]);
        } else {
            issuerSigs.push(sig);
        }
    }

    // Call the validation function on each entry
    // If you do not like the await in the for loop - write it in a better way. I have no Idea how to
    // write it so that it is still readable.
    const validSigners = [];
    for (const [issuer, sigsFromIssuer] of sigMapPerIssuer.entries()) {
        if (verifySignaturesLowLevel(await trustedKeys(issuer), sigsFromIssuer)) {
            validSigners.push(issuer);
        }
    }

    return validSigners;
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
 * @param dataList - List of data hashes that shall be filtered.
 * @returns - The array of elements that are signed by me.
 */
async function filterSignedByMe<T extends OneObjectTypes>(
    dataList: SHA256Hash<T>[]
): Promise<SHA256Hash<T>[]> {
    const key = await myKey();

    // Map from 'data[]' to '{data, signatures}[]' format
    const containers = await Promise.all(
        dataList.map(async data => {
            return {
                data: data,
                signatures: await signatures(data, key.owner as SHA256IdHash<Person>)
            };
        })
    );

    // Filter container based on valid signatures
    const containerSigned = containers.filter(container => {
        for (const signature of container.signatures) {
            if (verifySignatureLowLevel(key, signature)) {
                return true;
            }
        }
        return false;
    });

    // Map from '{data, signatures}[]' to 'data[]' format
    return containerSigned.map(container => container.data);
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
        hexToUint8Array(signature.signature), // hex string -> UInt8Array (binary)
        hexToUint8Array(key.publicSignKey) // Hex String -> UInt8Array (binary)
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
    const me = getInstanceOwnerIdHash();

    if (person === me) {
        const reverseMapEntry = await getAllEntries(me, 'Keys');
        if (reverseMapEntry.length === 0) {
            return [];
        } else {
            return [reverseMapEntry[0]];
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
    const reverseMapEntries = await getAllEntries(person, 'Keys');
    return reverseMapEntries.map(reverseMapEntry => reverseMapEntry);
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
 *
 * Let's keep it async for now, because we need to grab this from leute later, which is definitely async.
 */
async function myId(): Promise<SHA256IdHash<Person>> {
    const me = getInstanceOwnerIdHash();

    if (me === undefined) {
        throw new Error('Instance is not initialized');
    }
    return me;
}
