import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        BodyTemperature: BodyTemperature;
    }

    export interface BodyTemperature {
        $type$: 'BodyTemperature';
        temperature: number;
    }

    export interface BodyTemperature_1_0_0 extends Omit<BodyTemperature, '$type$'>{}
}

export const BodyTemperatureRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'BodyTemperature',
    rule: [
        {
            itemprop: 'temperature',
            valueType: 'number'
        }
    ]
};

// Export recipes

const BodyTemperatureRecipes: Recipe[] = [BodyTemperatureRecipe];

export default BodyTemperatureRecipes;
