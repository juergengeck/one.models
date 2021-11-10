import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {BLOB, CRDTMetaData, Group, Recipe} from 'one.core/lib/recipes';
import {generateCrdtMetaRecipe} from 'one.core/lib/crdt-recipes';
import type {VersionedObjectResult} from 'one.core/lib/storage';

// #### Typescript interfaces ####

export interface GroupProfile {
    $type$: 'GroupProfile';
    group: SHA256IdHash<Group>;
    name: string;
    picture: SHA256Hash<BLOB>;
}

// #### Recipes ####

export const GroupProfileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'GroupProfile',
    crdtConfig: new Map(),
    rule: [
        {
            itemprop: 'group',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Group'])},
            isId: true
        },
        {
            itemprop: 'name',
            itemtype: {type: 'string'}
        },
        {
            itemprop: 'picture',
            itemtype: {type: 'referenceToBlob'}
        }
    ]
};

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        GroupProfile: GroupProfile;
    }

    export interface OneCrdtIdObjectInterfaces {
        GroupProfile: Pick<GroupProfile, '$type$' | 'group'>;
    }
}

export default [GroupProfileRecipe];
