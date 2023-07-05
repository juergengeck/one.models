import type {Recipe, OneObjectTypeNames, Person} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

/**
 * This certificate gives somebody the right to declare trusted keys for this instance.
 *
 * The trust is given by creating a "TrustKeysCertificate" pointing to a profile that contains keys.
 *
 * Attention: This is a very very powerful right. Somebody with this right can impersonate
 * everybody else by just issuing new keys for that person.
 *
 * [signature.issuer] allows [beneficiary] to issue new trusted keys for somebody else.
 */
export interface RightToDeclareTrustedKeysForEverybodyCertificate {
    $type$: 'RightToDeclareTrustedKeysForEverybodyCertificate';
    beneficiary: SHA256IdHash<Person>;
}

export const RightToDeclareTrustedKeysForEverybodyCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RightToDeclareTrustedKeysForEverybodyCertificate',
    rule: [
        {
            itemprop: 'beneficiary',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        }
    ]
};

export const RightToDeclareTrustedKeysForEverybodyCertificateReverseMap: [
    OneObjectTypeNames,
    Set<string>
] = ['RightToDeclareTrustedKeysForEverybodyCertificate', new Set(['*'])];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        RightToDeclareTrustedKeysForEverybodyCertificate: RightToDeclareTrustedKeysForEverybodyCertificate;
    }
}
