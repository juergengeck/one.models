import type {Recipe} from '@refinio/one.core/lib/recipes';
import type {BlobDescriptor} from './BlobRecipes';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        Consent: Consent;
    }
}

export interface Consent {
    $type$: 'Consent';
    file: BlobDescriptor;
    status: 'given' | 'revoked';
    isoStringDate: string;
}

const ConsentRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Consent',
    rule: [
        {
            itemprop: 'file',
            itemtype: {
                type: 'referenceToObj',
                allowedTypes: new Set(['BlobDescriptor'])
            },
            optional: true
        },
        {
            itemprop: 'status',
            itemtype: {type: 'string'}
        },
        {
            itemprop: 'isoStringDate',
            itemtype: {type: 'string'}
        }
    ]
};

const ConsentRecipes: Recipe[] = [ConsentRecipe];

export default Consent;
