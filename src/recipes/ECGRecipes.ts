import {Recipe} from '@OneCoreTypes';
export interface ElectrocardiogramReadings {
    timeSinceSampleStart: number;
    leadVoltage: number;
}

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Electrocardiogram: Electrocardiogram;
    }

    export interface Electrocardiogram {
        $type$: 'Electrocardiogram';
        typeDescription?: string;
        voltageMeasurements: number;
        startTimestamp?: number;
        samplingFrequencyHz?: number;
        endTimestamp?: number;
        classification?: string;
        averageHeartRateBPM?: number;
        symptoms?: string;
        readings?: ElectrocardiogramReadings[];
    }
}

const ECGRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Electrocardiogram',
    rule: [
        {
            itemprop: 'typeDescription',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'voltageMeasurements',
            valueType: 'number'
        },
        {
            itemprop: 'startTimestamp',
            valueType: 'number',
            optional: true
        },
        {
            itemprop: 'samplingFrequencyHz',
            valueType: 'number',
            optional: true
        },
        {
            itemprop: 'endTimestamp',
            valueType: 'number',
            optional: true
        },
        {
            itemprop: 'classification',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'averageHeartRateBPM',
            valueType: 'number',
            optional: true
        },
        {
            itemprop: 'symptoms',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'readings',
            valueType: 'object'
        }
    ]
};

// Export recipes

const ECGRecipes: Recipe[] = [ECGRecipe];

export default ECGRecipes;