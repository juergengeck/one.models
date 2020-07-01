import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        CreationTime: CreationTime;
    }

    export interface CreationTime {
        $type$: 'CreationTime';
        timestamp: number;
        data: SHA256Hash<OneUnversionedObjectTypes>;
    }
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

// Export recipes

const MetaRecipes: Recipe[] = [CreationTimeRecipe];

export default MetaRecipes;
