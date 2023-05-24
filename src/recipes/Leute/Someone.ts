import type {Person, Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {Profile} from './Profile';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';

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

// #### Recipes ####

export const SomeoneRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Someone',
    crdtConfig: new Map(),
    rule: [
        {
            itemprop: 'someoneId',
            isId: true
        },
        {
            itemprop: 'mainProfile',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Profile'])}
        },
        {
            itemprop: 'identity',
            itemtype: {
                type: 'bag',
                item: {
                    type: 'object',
                    rules: [
                        {
                            itemprop: 'person',
                            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
                        },
                        {
                            itemprop: 'profile',
                            itemtype: {
                                type: 'bag',
                                item: {type: 'referenceToId', allowedTypes: new Set(['Profile'])}
                            }
                        }
                    ]
                }
            }
        }
    ]
};

// #### Reverse maps ####

export const SomeoneReverseMaps: [OneObjectTypeNames, Set<string>][] = [
    ['Someone', new Set(['*'])]
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        Someone: Someone;
    }

    export interface OneCrdtIdObjectInterfaces {
        Someone: Pick<Someone, '$type$' | 'someoneId'>;
    }
}

export default [SomeoneRecipe];
