import type {Instance, Recipe} from 'one.core/lib/recipes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';

declare module '@OneObjectInterfaces' {
    export interface OneIdObjectInterfaces {
        LocalInstancesList: Pick<LocalInstancesList, 'id' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        LocalInstancesList: LocalInstancesList;
    }
}

export interface LocalInstancesList {
    $type$: 'LocalInstancesList';
    id: string;
    instances: {instance: SHA256IdHash<Instance>}[];
}

const LocalInstancesListRecipie: Recipe = {
    $type$: 'Recipe',
    name: 'LocalInstancesList',
    rule: [
        {
            itemprop: 'id',
            regexp: /^LocalInstancesList$/,
            isId: true
        },
        {
            itemprop: 'instances',
            list: ORDERED_BY.APP,
            rule: [
                {
                    itemprop: 'instance',
                    referenceToId: new Set(['Instance'])
                }
            ]
        }
    ]
};

// Export recipes

const InstancesRecipes: Recipe[] = [LocalInstancesListRecipie];

export default InstancesRecipes;
