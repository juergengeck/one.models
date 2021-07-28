import {CRDTMetaData, Recipe, SHA256IdHash} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';
import {Someone} from './Someone';

// #### Typescript interfaces ####

/**
 * This is a global collection of all people known to the user.
 */
export interface Leute {
    $type$: 'Leute';
    appId: 'Leute';
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
            itemprop: 'singletonId',
            regexp: /^Leute$/,
            isId: true
        },
        {
            itemprop: 'me',
            referenceToObj: new Set(['Someone'])
        },
        {
            itemprop: 'other',
            referenceToObj: new Set(['Someone']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const LeuteCRDTDataRecipe: Recipe = generateCrdtRecipe(LeuteRecipe, 'LeuteCRDTMetaData');

// #### one.core interfaces ####

declare module '@OneCoreTypes' {
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
