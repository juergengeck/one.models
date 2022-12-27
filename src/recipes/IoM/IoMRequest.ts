import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person, Recipe} from '@refinio/one.core/lib/recipes';

// #### Typescript interfaces ####

export interface IoMRequest {
    $type$: 'IoMRequest';
    timestamp: number;
    initiator: SHA256IdHash<Person>;
    participants: Set<SHA256IdHash<Person>>;
}

// #### Recipes ####

export const IoMRequestRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'IoMRequest',
    rule: [
        {
            itemprop: 'timestamp',
            itemtype: {type: 'number'}
        },
        {
            itemprop: 'initiator',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'participants',
            itemtype: {
                type: 'set',
                item: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
            }
        }
    ]
};

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        IoMRequest: IoMRequest;
    }
}

export default [IoMRequestRecipe];
