import type {
    Person,
    Recipe,
    OneUnversionedObjectTypes,
    BLOB,
    OneObjectTypes, OneObjectTypeNames
} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {HexString} from '../misc/ArrayBufferHexConvertor';
import {HexStringRegex} from '../misc/ArrayBufferHexConvertor';

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
    object: SHA256Hash;
    metaObjects: Map<OneObjectTypeNames, Array<SHA256Hash>>;
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
                type: 'referenceToObj',
                allowedTypes: new Set(['*'])
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
                    type: 'referenceToObj',
                    allowedTypes: new Set(['*'])
                }
            }
        }
    ]
};

const MetaObjectMapRecipes: Recipe[] = [MetaObjectMapRecipe];

export default MetaObjectMapRecipes;
