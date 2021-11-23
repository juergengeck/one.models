import type {Instance, Recipe} from '@refinio/one.core/lib/recipes';
import {ORDERED_BY} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

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
            itemtype: {type: 'string', regexp: /^LocalInstancesList$/},
            isId: true
        },
        {
            itemprop: 'instances',
            itemtype: {
                type: 'array',
                item: {
                    type: 'object',
                    rules: [
                        {
                            itemprop: 'instance',
                            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Instance'])}
                        }
                    ]
                }
            }
        }
    ]
};

const InstancesRecipes: Recipe[] = [LocalInstancesListRecipie];

export default InstancesRecipes;
