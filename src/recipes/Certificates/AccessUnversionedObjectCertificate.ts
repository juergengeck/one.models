import type {OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

/**
 * This certificate gives another person access to the pointed to data.
 *
 * [signature.issuer] gives [person] access to [data]
 */
export interface AccessUnversionedObjectCertificate {
    $type$: 'AccessUnversionedObjectCertificate';
    person: SHA256IdHash<Person>;
    data: SHA256Hash<OneUnversionedObjectTypes>;
}

export const AccessUnversionedObjectCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AccessUnversionedObjectCertificate',
    rule: [
        {
            itemprop: 'person',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['*'])}
        }
    ]
};

export const AccessUnversionedObjectCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'AccessUnversionedObjectCertificate',
    new Set(['*'])
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        AccessUnversionedObjectCertificate: AccessUnversionedObjectCertificate;
    }
}
