import type {CRDTMetaData, Recipe} from 'one.core/lib/recipes';
import {generateCrdtMetaRecipe} from 'one.core/lib/crdt-recipes';
import type {Someone} from './Someone';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {VersionedObjectResult} from 'one.core/lib/storage';

// #### Typescript interfaces ####

/**
 * This is a global collection of all people known to the user.
 */
export interface Leute {
    $type$: 'Leute';
    appId: 'one.leute';
    me: SHA256IdHash<Someone>;
    other: SHA256IdHash<Someone>[];
}

export interface LeuteCRDTMetaData extends CRDTMetaData<Leute> {
    $type$: 'LeuteCRDTMetaData';
}

// #### Recipes ####

export const LeuteRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Leute',
    rule: [
        {
            itemprop: 'appId',
            itemtype: {type: 'string', regexp: /^one.leute$/},
            isId: true
        },
        {
            itemprop: 'me',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Someone'])}
        },
        {
            itemprop: 'other',
            itemtype: {
                type: 'bag',
                item: {type: 'referenceToId', allowedTypes: new Set(['Someone'])}
            }
        }
    ]
};

export const LeuteCRDTDataRecipe: Recipe = generateCrdtMetaRecipe(LeuteRecipe, 'LeuteCRDTMetaData');

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        Leute: Leute;
    }

    export interface OneCrdtIdObjectInterfaces {
        Leute: Pick<Leute, '$type$' | 'appId'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        LeuteCRDTMetaData: LeuteCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        Leute: LeuteCRDTMetaData;
    }

    export interface PlanResultTypes {
        '@module/profileManagerWriteLeute': {
            args: any;
            result: VersionedObjectResult<Leute>;
        };
    }
}

export default [LeuteRecipe, LeuteCRDTDataRecipe];
