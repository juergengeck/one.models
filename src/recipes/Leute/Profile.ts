import type {Person, Recipe} from '@refinio/one.core/lib/recipes.js';
import type {CommunicationEndpointTypes} from './CommunicationEndpoints.js';
import {CommunicationEndpointTypeNameSet} from './CommunicationEndpoints.js';
import type {PersonDescriptionTypes} from './PersonDescriptions.js';
import {PersonDescriptionTypeNameSet} from './PersonDescriptions.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {
    OneObjectTypeNames,
    OneVersionedObjectTypeNames
} from '@refinio/one.core/lib/recipes.js';

// #### Typescript interfaces ####

export interface Profile {
    $type$: 'Profile';
    profileId: string;
    personId: SHA256IdHash<Person>;
    owner: SHA256IdHash<Person>;
    communicationEndpoint: SHA256Hash<CommunicationEndpointTypes>[];
    personDescription: SHA256Hash<PersonDescriptionTypes>[];
}

// #### Recipes ####

export const ProfileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Profile',
    crdtConfig: new Map(),
    rule: [
        {
            itemprop: 'profileId',
            itemtype: {type: 'string'},
            isId: true
        },
        {
            itemprop: 'personId',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
            isId: true
        },
        {
            itemprop: 'owner',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
            isId: true
        },
        {
            itemprop: 'communicationEndpoint',
            itemtype: {
                type: 'bag',
                item: {type: 'referenceToObj', allowedTypes: CommunicationEndpointTypeNameSet}
            }
        },
        {
            itemprop: 'personDescription',
            itemtype: {
                type: 'bag',
                item: {type: 'referenceToObj', allowedTypes: PersonDescriptionTypeNameSet}
            }
        }
    ]
};

// #### Reverse maps ####

export const ProfileReverseMaps: [OneObjectTypeNames, Set<string>][] = [
    ['Profile', new Set(['communicationEndpoint', 'personDescription'])]
];

export const ProfileReverseMapsForIdObjects: [OneVersionedObjectTypeNames, Set<string>][] = [
    ['Profile', new Set(['owner', 'personId'])]
];

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        Profile: Profile;
    }

    export interface OneCrdtIdObjectInterfaces {
        Profile: Pick<Profile, '$type$' | 'personId' | 'profileId' | 'owner'>;
    }
}

export default [ProfileRecipe];
