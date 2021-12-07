import type {
    Person,
    Recipe
} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {HexString} from '../misc/ArrayBufferHexConvertor';
import {HexStringRegex} from '../misc/ArrayBufferHexConvertor';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        Signature: Signature;
    }
}

/**
 * TS interface for SignatureRecipe.
 */
export interface Signature {
    $type$: 'Signature';
    issuer: SHA256IdHash<Person>;
    data: SHA256Hash;
    signature: HexString;
}

/**
 * Represents a digital signature.
 *
 * Note: We omitted the algorithm and the public key from this object because they have security implications:
 * 1) algorithm: Can be misused by an attacker - the public key was generated for a specific algorithm, so if different
 *              algorithms shall be supported, then the algorithm needs to be paired with the public key
 * 2) public key: Developers might think, that it is enough to test the signature against the public key stored here.
 *                But the key is not trustworthy, until cleared by the key- / identity management.
 *                Drawback is, that you need to test all available keys for this identity, because you do not know
 *                which key was used. This can be made better by a hint (giving keys unique ids and using this id here
 *                instead of storing the whole public key)
 * The issuer is also not trustworthy, until you checked the signature and know that the person uses this key. We could
 * also omit the issuer, but then we would need to test all known keys of all persons and this would take too much time.
 */
export const SignatureRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Signature',
    rule: [
        {
            itemprop: 'issuer',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['*'])}
        },
        {
            itemprop: 'signature',
            itemtype: {type: 'string', regexp: HexStringRegex}
        }
    ]
};

const SignatureRecipes: Recipe[] = [SignatureRecipe];

export default SignatureRecipes;
