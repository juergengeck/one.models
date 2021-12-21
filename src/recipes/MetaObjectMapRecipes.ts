import type {
    Recipe,
    OneObjectTypeNames
} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

declare module '@OneObjectInterfaces' {
    export interface OneVersionedObjectInterfaces {
        MetaObjectMap: MetaObjectMap;
    }

    export interface OneIdObjectInterfaces {
        MetaObjectMap: Pick<MetaObjectMap, '$type$' | 'object'>;
    }
}

/**
 * TS interface for MetaObjectMapRecipe.
 */
export interface MetaObjectMap {
    $type$: 'MetaObjectMap';
    object: SHA256Hash | SHA256IdHash;
    metaObjects: Map<OneObjectTypeNames, Set<SHA256Hash>>;
}

/**
 * This recipe stores a list of metaobject that point to some data.
 *
 * Without this map, the metaobjects could not be found, because no other object points to it.
 */
export const MetaObjectMapRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'MetaObjectMap',
    rule: [
        {
            itemprop: 'object',
            isId: true,
            itemtype: {
                // This should be any reference (SHA256IdHash or SHA256Hash to a BLOB or CBLOB,
                // but one.core does not support it, yet => string with regex)
                type: 'string',
                regexp: /^[0-9a-fA-F]{64}$/
            }
        },
        {
            itemprop: 'metaObjects',
            itemtype: {
                type: 'map',
                key: {
                    type: 'string'
                },
                value: {
                    type: 'set',
                    item: {
                        type: 'referenceToObj',
                        allowedTypes: new Set(['*'])
                    }
                }
            }
        }
    ]
};

const MetaObjectMapRecipes: Recipe[] = [MetaObjectMapRecipe];

export default MetaObjectMapRecipes;
