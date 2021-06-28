import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        BloodGlucose: BloodGlucose;
    }

    export interface BloodGlucose {
        $type$: 'BloodGlucose';
        typeDescription?: string;
        value: number;
        unit: string;
        startTimestamp?: number;
        endTimestamp?: number;
    }
}

const BloodGlucoseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'BloodGlucose',
    rule: [
        {
            itemprop: 'typeDescription',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'value',
            valueType: 'number'
        },
        {
            itemprop: 'unit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'startTimestamp',
            valueType: 'number',
            optional: true
        },
        {
            itemprop: 'endTimestamp',
            valueType: 'number',
            optional: true
        }
    ]
};

// Export recipes

const BloodGlucoseRecipes: Recipe[] = [BloodGlucoseRecipe];

export default BloodGlucoseRecipes;