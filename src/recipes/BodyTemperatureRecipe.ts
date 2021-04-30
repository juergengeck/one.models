import type {Recipe} from 'one.core/lib/recipes';
declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        BodyTemperature: BodyTemperature;
    }
}

export interface BodyTemperature {
    $type$: 'BodyTemperature';
    temperature: number;
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
