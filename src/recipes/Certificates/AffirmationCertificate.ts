import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';

/**
 * Affirms that the pointed to data is 'correct'.
 *
 * [signature.issuer] asserts that [data] is correct.
 */
export interface AffirmationCertificate {
    $type$: 'AffirmationCertificate';
    data: SHA256Hash;
}

export const AffirmationCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AffirmationCertificate',
    rule: [
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['*'])}
        }
    ]
};

export const AffirmationCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'AffirmationCertificate',
    new Set(['*'])
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        AffirmationCertificate: AffirmationCertificate;
    }
}
