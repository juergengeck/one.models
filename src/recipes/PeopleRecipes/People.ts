import {CRDTMetaData, Recipe, SHA256IdHash} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';
import {Someone} from './Someone';

// #### Typescript interfaces ####

/**
 * This is a global collection of all people known to the user.
 */
export interface People {
    $type$: 'People';
    appId: 'People';
    me: SHA256IdHash<Someone>;
    other: SHA256IdHash<Someone>[];
}

export interface PeopleCRDTMetaData extends CRDTMetaData<People> {
    $type$: 'PeopleCRDTMetaData';
}

// #### Recipes ####

export const PeopleRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'People',
    rule: [
        {
            itemprop: 'singletonId',
            regexp: /^People$/,
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

export const PeopleCRDTDataRecipe: Recipe = generateCrdtRecipe(PeopleRecipe, 'PeopleCRDTMetaData');

// #### one.core interfaces ####

declare module '@OneCoreTypes' {
    export interface OneCrdtObjectInterfaces {
        People: People;
    }

    export interface OneCrdtIdObjectInterfaces {
        People: Pick<People, '$type$' | 'appId'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        PeopleCRDTMetaData: PeopleCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        People: PeopleCRDTMetaData;
    }

    export interface PlanResultTypes {
        '@module/profileManagerWritePeople': {
            args: any;
            result: VersionedObjectResult<People>;
        };
    }
}
