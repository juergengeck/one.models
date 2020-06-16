import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        BodyTemperature: BodyTemperature;
    }

    export interface BodyTemperature {
        type: 'BodyTemperature';
        temperature: number;
    }
}

export const BodyTemperatureRecipie: Recipe = {
    type: 'Recipe',
    name: 'BodyTemperature',
    rule: [
        {
            itemprop: 'temperature',
            valueType: 'string'
        }
    ]
};

// Export recipies

const BodyTemperatureRecipes: Recipe[] = [BodyTemperatureRecipie];

export default BodyTemperatureRecipes;
