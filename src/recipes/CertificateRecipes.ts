import type {Person, Recipe, OneUnversionedObjectTypes, BLOB} from 'one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        Certificate: Certificate;
        License: License;
    }
}

export type LicenseType = 'access' | 'truth';

export interface Certificate {
    $type$: 'Certificate';
    license: SHA256Hash<License>;
    issuer: SHA256IdHash<Person>;
    subject: SHA256Hash<OneUnversionedObjectTypes>;
    target: SHA256IdHash<Person>;
    signature: string;
}

export interface License {
    $type$: 'License';
    text: string;
}

export const CertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Certificate',
    rule: [
        {
            itemprop: 'license',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['License'])}
        },
        {
            itemprop: 'issuer',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'subject',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['*'])}
        },
        {
            itemprop: 'target',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'signature',
            //  check for the characters A to Z, a to z, 0 to 9, plus (+), and forward-slash (/)
            //  combined in a multiple of 4. If the number of characters is not an exact multiple
            //  of 4, the expression must search for the equal sign (=) as padding at the end.
            itemtype: {type: 'string', regexp: /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{3}=|[A-Za-z\d+/]{2}==)?$/}
        }
    ]
};

export const LicenseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'License',
    rule: [
        {
            itemprop: 'text',
            itemtype: {type: 'string'}
        }
    ]
};

const CertificateRecipes: Recipe[] = [CertificateRecipe, LicenseRecipe];

export default CertificateRecipes;
