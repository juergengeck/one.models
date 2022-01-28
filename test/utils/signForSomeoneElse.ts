import tweetnacl from 'tweetnacl';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {addMetaObject} from '../../lib/misc/MetaObjectMap';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';

/**
 * Create a signature object with someone else as issuer and a private key.
 *
 * The current signature module does not support this because of limitations of the key management. That's why we
 * have this helper function.
 *
 * @param data
 * @param issuer
 * @param secretKey
 */
export async function signForSomeoneElse(
    data: SHA256Hash,
    issuer: SHA256IdHash<Person>,
    secretKey: Uint8Array
): Promise<void> {
    const signatureBinary = tweetnacl.sign.detached(new TextEncoder().encode(data), secretKey);
    const signatureString = uint8arrayToHexString(signatureBinary);
    const result = await storeUnversionedObject({
        $type$: 'Signature',
        issuer,
        data,
        signature: signatureString
    });
    await addMetaObject(issuer, result.hash);
    await addMetaObject(data, result.hash);
}
