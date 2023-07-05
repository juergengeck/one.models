import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {Profile} from '../Leute/Profile';

/**
 * Certifies the contained keys as trusted keys (the issuer knows that the keys belongs to the person)
 *
 * [signature.issuer] asserts that keys in [profile] belong to the person referenced by the profile.
 */
export interface TrustKeysCertificate {
    $type$: 'TrustKeysCertificate';
    profile: SHA256Hash<Profile>;
}

export const TrustKeysCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'TrustKeysCertificate',
    rule: [
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['Profile'])}
        }
    ]
};

export const TrustKeysCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'TrustKeysCertificate',
    new Set(['*'])
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        TrustKeysCertificate: TrustKeysCertificate;
    }
}
