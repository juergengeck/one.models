import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        BodyTemperature: BodyTemperature;
    }

    export interface BodyTemperature {
        $type$: 'BodyTemperature';
        temperature: number;
    }
}

export const BodyTemperatureRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'BodyTemperature',
    rule: [
        {
            itemprop: 'temperature',
            valueType: 'string'
        }
    ]
};

// Export recipes

const BodyTemperatureRecipes: Recipe[] = [BodyTemperatureRecipe];

export default BodyTemperatureRecipes;
