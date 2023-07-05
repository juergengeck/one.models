import type {Person} from '@refinio/one.core/lib/recipes';
import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

/**
 * This certificate gives another person access to all versions of the pointed to id.
 *
 * [signature.issuer] gives [person] access to [data]
 */
export interface AccessVersionedObjectCertificate {
    $type$: 'AccessVersionedObjectCertificate';
    person: SHA256IdHash<Person>;
    data: SHA256IdHash;
}

export const AccessVersionedObjectCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AccessVersionedObjectCertificate',
    rule: [
        {
            itemprop: 'person',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['*'])}
        }
    ]
};

export const AccessVersionedObjectCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'AccessVersionedObjectCertificate',
    new Set(['*'])
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        AccessVersionedObjectCertificate: AccessVersionedObjectCertificate;
    }
}
