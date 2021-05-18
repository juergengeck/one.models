import {Recipe} from '@OneCoreTypes';

export const HEART_OCCURRING_EVENTS = {
    LowHeartRate: 'LowHeartRate',
    HighHeartRate: 'HighHeartRate',
    IrregularHeartRhythm: 'IrregularHeartRhythm'
} as const;

export type HeartOccurringEvents = typeof HEART_OCCURRING_EVENTS[keyof typeof HEART_OCCURRING_EVENTS];

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        HeartEvent: HeartEvent;
    }

    export interface HeartEvent {
        $type$: 'HeartEvent';
        occurredHeartEvent: HeartOccurringEvents;
    }
}

const HeartEventRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'HeartEvent',
    rule: [
        {
            itemprop: 'occurredHeartEvent',
            valueType: 'string'
        }
    ]
};

const HeartEventRecipes: Recipe[] = [HeartEventRecipe];

export default HeartEventRecipes;
