import type {Person} from '@refinio/one.core/lib/recipes';
import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

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
export interface RelationCertificate {
    $type$: 'RelationCertificate';
    app: string;
    relation: string;
    person1: SHA256IdHash<Person>;
    person2: SHA256IdHash<Person>;
}

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

export const RelationCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'RelationCertificate',
    new Set(['*'])
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        RelationCertificate: RelationCertificate;
    }
}
