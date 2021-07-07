import type {OneUnversionedObjectTypes, Recipe} from 'one.core/lib/recipes';
import type {SHA256Hash} from 'one.core/lib/util/type-checks';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        CreationTime: CreationTime;
    }
}

export interface CreationTime {
    $type$: 'CreationTime';
    timestamp: number;
    data: SHA256Hash<OneUnversionedObjectTypes>;
}

const CreationTimeRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'CreationTime',
    rule: [
        {
            itemprop: 'timestamp',
            valueType: 'number'
        },
        {
            itemprop: 'data',
            referenceToObj: new Set(['*'])
        }
    ]
};

const MetaRecipes: Recipe[] = [CreationTimeRecipe];

export default MetaRecipes;
