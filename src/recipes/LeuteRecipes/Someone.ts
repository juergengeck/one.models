import {CRDTMetaData, ORDERED_BY, Person, Recipe} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';
import type {Profile} from './Profile';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {VersionedObjectResult} from 'one.core/lib/storage';

// #### Typescript interfaces ####

export interface Someone {
    $type$: 'Someone';
    someoneId: string;
    mainProfile: SHA256IdHash<Profile>;
    identity: {
        person: SHA256IdHash<Person>;
        profile: SHA256IdHash<Profile>[];
    }[];
}

export interface SomeoneCRDTMetaData extends CRDTMetaData<Someone> {
    $type$: 'SomeoneCRDTMetaData';
}

// #### Recipes ####

export const SomeoneRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Someone',
    rule: [
        {
            itemprop: 'someoneId',
            isId: true
        },
        {
            itemprop: 'mainProfile',
            referenceToId: new Set(['Profile'])
        },
        {
            itemprop: 'identity',
            list: ORDERED_BY.ONE,
            rule: [
                {
                    itemprop: 'person',
                    referenceToId: new Set(['Person'])
                },
                {
                    itemprop: 'profile',
                    referenceToId: new Set(['Profile']),
                    list: ORDERED_BY.ONE
                }
            ]
        }
    ]
};

export const SomeoneCRDTDataRecipe: Recipe = generateCrdtRecipe(
    SomeoneRecipe,
    'SomeoneCRDTMetaData'
);

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        Someone: Someone;
    }

    export interface OneCrdtIdObjectInterfaces {
        Someone: Pick<Someone, '$type$' | 'someoneId'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        SomeoneCRDTMetaData: SomeoneCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        Someone: SomeoneCRDTMetaData;
    }

    export interface PlanResultTypes {
        '@module/profileManagerWriteSomeone': {
            args: any;
            result: VersionedObjectResult<Someone>;
        };
    }
}

export default [SomeoneRecipe, SomeoneCRDTDataRecipe];
