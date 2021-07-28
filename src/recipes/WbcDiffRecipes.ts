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

import type {Recipe, RecipeRule} from 'one.core/lib/recipes';

export interface WbcMeasurement {
    value: string;
    unit: string;
    unsafe?: boolean;
}

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        WbcObservation: WbcObservation;
    }
}

export interface WbcObservation {
    $type$: 'WbcObservation';
    acquisitionTime: string; // time the measurement took place e.g. '2020-09-04T12:10:01+01:00';
    Leukocytes: WbcMeasurement;
    Neutrophils?: WbcMeasurement;
    Lymphocytes?: WbcMeasurement;
    Monocytes?: WbcMeasurement;
    Eosinophils?: WbcMeasurement;
    Basophils?: WbcMeasurement;
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
            itemprop: 'acquisitionTime',
            valueType: 'string'
        },
        {
            itemprop: 'Leukocytes',
            rule: WbcMeasurementRules
        },
        {
            itemprop: 'Neutrophils',
            rule: WbcMeasurementRules,
            optional: true
        },
        {
            itemprop: 'Lymphocytes',
            rule: WbcMeasurementRules,
            optional: true
        },
        {
            itemprop: 'Monocytes',
            rule: WbcMeasurementRules,
            optional: true
        },
        {
            itemprop: 'Eosinophils',
            rule: WbcMeasurementRules,
            optional: true
        },
        {
            itemprop: 'Basophils',
            rule: WbcMeasurementRules,
            optional: true
        }
    ]
};

// Export recipes

const WbcRecipes: Recipe[] = [WbcObservation];

export default WbcRecipes;
