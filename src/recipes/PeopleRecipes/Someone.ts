import {CRDTMetaData, Person, Recipe, SHA256IdHash} from "@OneCoreTypes";
import {ORDERED_BY} from "one.core/lib/recipes";
import {generateCrdtRecipe} from "one.core/lib/crdt-recipes";
import {Profile} from "./Profile";

// #### Typescript interfaces ####

export interface Someone {
    $type$: 'Someone';
    id: string;
    mainProfile: SHA256IdHash<Profile>;
    identity: {
        person: SHA256IdHash<Person>,
        profile: SHA256IdHash<Profile>,
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
            itemprop: 'id',
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
                    list: ORDERED_BY.ONE,
                },
            ]
        }
    ]
};

export const SomeoneCRDTDataRecipe: Recipe = generateCrdtRecipe(
    SomeoneRecipe,
    'SomeoneCRDTMetaData'
);

// #### one.core interfaces ####

declare module '@OneCoreTypes' {
    export interface OneCrdtObjectInterfaces {
        Someone: Someone;
    }

    export interface OneCrdtIdObjectInterfaces {
        Someone: Pick<Someone, '$type$' | 'id'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        SomeoneCRDTMetaData: SomeoneCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        Someone: SomeoneCRDTMetaData;
    }
}
