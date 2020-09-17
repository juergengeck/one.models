import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        WbcMeasurement: WbcMeasurement;
    }

    export interface WbcMeasurement {
        $type$: 'WbcMeasurement';
        measurement: object;
    }
}

const WbcMeasurement: Recipe = {
    $type$: 'Recipe',
    name: 'WbcMeasurement',
    rule: [
        {
            itemprop: 'measurement',
            valueType: 'object'
        }
    ]
};

// Export recipes

const WbcRecipes: Recipe[] = [WbcMeasurement];

export default WbcRecipes;
