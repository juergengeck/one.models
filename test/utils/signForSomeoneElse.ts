import type {SHA256Hash, SHA256IdHash} from "@refinio/one.core/lib/util/type-checks";
import type {Person} from "@refinio/one.core/lib/recipes";
import tweetnacl from "tweetnacl";
import {arrayBufferToHex} from "../../lib/misc/ArrayBufferHexConvertor";
import {storeMetaObject} from "../../lib/misc/MetaObjectMap";

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
export async function signForSomeoneElse(data: SHA256Hash, issuer: SHA256IdHash<Person>, secretKey: Uint8Array): Promise<void> {
    const signatureBinary = tweetnacl.sign.detached(
        new TextEncoder().encode(data),
        secretKey
    );
    const signatureString = arrayBufferToHex(signatureBinary.buffer);
    await storeMetaObject(data, {
        $type$: 'Signature',
        issuer,
        data,
        signature: signatureString
    });
}
