import {Recipe} from '@OneCoreTypes';
import {ORDERED_BY} from "one.core/lib/recipes";

declare module '@OneCoreTypes' {
    export interface OneIdObjectInterfaces {
        LocalInstancesList: Pick<LocalInstancesList, 'id' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        LocalInstancesList: LocalInstancesList;
    }

    export interface LocalInstancesList {
        $type$: 'LocalInstancesList';
        id: string;
        instances: { instance: SHA256IdHash<Instance> }[];
    }
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
