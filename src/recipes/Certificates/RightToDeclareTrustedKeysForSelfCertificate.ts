import type {Recipe, OneObjectTypeNames, Person} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

/**
 * This certificate gives somebody the right to declare trusted keys for himself.
 *
 * The trust is given by creating an "AffirmationCertificate" pointing to a profile that contains
 * keys.
 *
 * [signature.issuer] allows [beneficiary] to issue new trusted keys for [beneficiary].
 */
export interface RightToDeclareTrustedKeysForSelfCertificate {
    $type$: 'RightToDeclareTrustedKeysForSelfCertificate';
    beneficiary: SHA256IdHash<Person>;
}

export const RightToDeclareTrustedKeysForSelfCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RightToDeclareTrustedKeysForSelfCertificate',
    rule: [
        {
            itemprop: 'beneficiary',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        }
    ]
};

export const RightToDeclareTrustedKeysForSelfCertificateReverseMap: [
    OneObjectTypeNames,
    Set<string>
] = ['RightToDeclareTrustedKeysForSelfCertificate', new Set(['*'])];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        RightToDeclareTrustedKeysForSelfCertificate: RightToDeclareTrustedKeysForSelfCertificate;
    }
}
