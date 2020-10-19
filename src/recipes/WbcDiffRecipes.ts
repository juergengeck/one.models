import {Recipe, RecipeRule} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        WbcObservation: WbcObservation;
    }

    /**
     * This represents a Wbc Measurement.
     *
     * Q: Why would we use string for encoding the value?
     * A: - float would probably change the value if the value is not representable
     *    - number does not support decimal places
     *    - the communication / storage is string based, so why convert the value
     *      to a number / ... and then convert it back to a string with potential
     *      modifications?
     *    - This is medically relevant information, so try not to modify values,
     *      keep them as-is from start to end.
     */

    export interface WbcMeasurement {
        $type$: 'WbcMeasurement';
        value: string;
        unit: string;
        unsafe?: boolean;
    }

    export interface WbcObservation {
        $type$: 'WbcObservation';
        acquisitonTime: string; // time the measurment took place e.g. '2020-09-04T12:10:01+01:00';
        Neutrophils: WbcMeasurement;
        Lymphocytes: WbcMeasurement;
        Monocytes: WbcMeasurement;
        Eosinophils: WbcMeasurement;
        Basophils: WbcMeasurement;
        Leukocytes: WbcMeasurement;
    }
}

const WbcMeasurementRules: RecipeRule[] = [
    {
        itemprop: 'value',
        valueType: 'string'
    },
    {
        itemprop: 'unit',
        valueType: 'string'
    },
    {
        itemprop: 'unsafe',
        valueType: 'boolean',
        optional: true
    }
];

const WbcObservation: Recipe = {
    $type$: 'Recipe',
    name: 'WbcObservation',
    rule: [
        {
            itemprop: 'acquisitonTime',
            valueType: 'string'
        },
        {
            itemprop: 'Neutrophils',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Lymphocytes',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Monocytes',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Eosinophils',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Basophils',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Leukocytes',
            rule: WbcMeasurementRules
        }
    ]
};

// Export recipes

const WbcRecipes: Recipe[] = [WbcObservation];

export default WbcRecipes;
