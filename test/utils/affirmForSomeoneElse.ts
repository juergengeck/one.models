import type {SHA256Hash, SHA256IdHash} from "@refinio/one.core/lib/util/type-checks";
import type {Person} from "@refinio/one.core/lib/recipes";
import {storeMetaObject} from "../../lib/misc/MetaObjectMap";
import {signForSomeoneElse} from "./signForSomeoneElse";

/**
 * Create an affirmation certificate for another personId.
 *
 * The current certificate module does not support this because of limitations of the key management. That's why we
 * have this helper function.
 *
 * @param data
 * @param issuer
 * @param secretKey
 */
export async function affirmForSomeoneElse(data: SHA256Hash, issuer: SHA256IdHash<Person>, secretKey: Uint8Array): Promise<void> {
    const certificateHash = (await storeMetaObject(data, {
        $type$: 'AffirmationCertificate',
        data: data
    })).hash;
    await signForSomeoneElse(certificateHash, issuer, secretKey);
}
