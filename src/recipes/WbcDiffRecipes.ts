import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        WbcMeasurement: WbcMeasurement;
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
        wbcCount: string;
        wbcCountUnit: string;
        neuCount?: string;
        neuCountUnit?: string;
        neuCountUnsafe?: boolean;
        lymCount?: string;
        lymCountUnit?: string;
        lymCountUnsafe?: boolean;
        monCount?: string;
        monCountUnit?: string;
        monCountUnsafe?: boolean;
        eosCount?: string;
        eosCountUnit?: string;
        eosCountUnsafe?: boolean;
        basCount?: string;
        basCountUnit?: string;
        basCountUnsafe?: boolean;
    }
}

const WbcMeasurement: Recipe = {
    $type$: 'Recipe',
    name: 'WbcMeasurement',
    rule: [
        {
            itemprop: 'wbcCount',
            valueType: 'string'
        },
        {
            itemprop: 'wbcCountUnit',
            valueType: 'string'
        },
        {
            itemprop: 'neuCount',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'neuCountUnit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'neuCountUnsafe',
            valueType: 'boolean',
            optional: true
        },
        {
            itemprop: 'lymCount',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'lymCountUnit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'lymCountUnsafe',
            valueType: 'boolean',
            optional: true
        },
        {
            itemprop: 'monCount',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'monCountUnit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'monCountUnsafe',
            valueType: 'boolean',
            optional: true
        },
        {
            itemprop: 'eosCount',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'eosCountUnit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'eosCountUnsafe',
            valueType: 'boolean',
            optional: true
        },
        {
            itemprop: 'basCount',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'basCountUnit',
            valueType: 'string',
            optional: true
        },
        {
            itemprop: 'basCountUnsafe',
            valueType: 'boolean',
            optional: true
        }
    ]
};

// Export recipes

const WbcRecipes: Recipe[] = [WbcMeasurement];

export default WbcRecipes;
