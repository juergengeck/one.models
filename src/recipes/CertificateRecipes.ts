import type {
    Person,
    Recipe,
    OneUnversionedObjectTypes,
    OneObjectTypeNames
} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

// #### Typescript interfaces  & Recipes ####

/**
 * TS Interface for AccessUnversionedObjectCertificateRecipe
 */
export interface AccessUnversionedObjectCertificate {
    $type$: 'AccessUnversionedObjectCertificate';
    person: SHA256IdHash<Person>;
    data: SHA256Hash<OneUnversionedObjectTypes>;
}

/**
 * This certificate gives another person access to the pointed to data.
 *
 * [signature.issuer] gives [person] access to [data]
 */
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

/**
 * TS Interface for AccessVersionedObjectCertificateRecipe
 */
export interface AccessVersionedObjectCertificate {
    $type$: 'AccessVersionedObjectCertificate';
    person: SHA256IdHash<Person>;
    data: SHA256IdHash;
}

/**
 * This certificate gives another person access to the pointed to data.
 *
 * [signature.issuer] gives [person] access to [data]
 */
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

/**
 * TS Interface for RelationCertificateRecipe
 */
export interface RelationCertificate {
    $type$: 'RelationCertificate';
    app: string;
    relation: string;
    person1: SHA256IdHash<Person>;
    person2: SHA256IdHash<Person>;
}

/**
 * This certificates affirms that a person has a specific relation to another person (or organization).
 *
 * [signature.issuer] confirms, that in the context of the application [app],
 * [person1] has a [relation] to [person2]
 *
 * Examples:
 * - Person1 is a doctor at a clinic(Person2)
 * - Person1 is related to Person2
 * - Person1 is a patient at doctor(Person2)
 *
 * This stuff is application specific, so the application has to decide which relations make sense.
 */
export const RelationCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RelationCertificate',
    rule: [
        {
            itemprop: 'app'
        },
        {
            itemprop: 'relation'
        },
        {
            itemprop: 'person1',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'person2',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        }
    ]
};

/**
 * TS Interface for RelationCertificateRecipe
 */
export interface AffirmationCertificate {
    $type$: 'AffirmationCertificate';
    data: SHA256Hash;
}

/**
 * This certificate affirms the information in the pointed to object.
 *
 * [signature.issuer] asserts that [data] is true
 */
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

/**
 * TS Interface for RelationCertificateRecipe
 */
export interface TrustKeysCertificate {
    $type$: 'TrustKeysCertificate';
    profile: SHA256Hash<Profile>;
}

/**
 * This certificate affirms the information in the pointed to object.
 *
 * [signature.issuer] asserts that [data] is true
 */
export const TrustKeysCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'TrustKeysCertificate',
    rule: [
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['*'])}
        }
    ]
};

const CertificateRecipes: Recipe[] = [
    AccessUnversionedObjectCertificateRecipe,
    AccessVersionedObjectCertificateRecipe,
    RelationCertificateRecipe,
    AffirmationCertificateRecipe,
    TrustKeysCertificateRecipe
];

// #### Reverse maps ####

export const CertificateReverseMaps: [OneObjectTypeNames, Set<string>][] = [
    ['AccessUnversionedObjectCertificate', new Set(['*'])],
    ['AccessVersionedObjectCertificate', new Set(['*'])],
    ['RelationCertificate', new Set(['*'])],
    ['AffirmationCertificate', new Set(['*'])],
    ['TrustKeysCertificate', new Set(['*'])]
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        AccessUnversionedObjectCertificate: AccessUnversionedObjectCertificate;
        AccessVersionedObjectCertificate: AccessVersionedObjectCertificate;
        RelationCertificate: RelationCertificate;
        AffirmationCertificate: AffirmationCertificate;
        TrustKeysCertificate: TrustKeysCertificate;
        // Zertificate um jemandem die Rechte zu geben neue Schlüssel einzubringen
    }
}

export default CertificateRecipes;
