import type { Person, Recipe} from 'one.core/lib/recipes';
import {
    CommunicationEndpointTypeNameSet,
    CommunicationEndpointTypes
} from './CommunicationEndpoints';
import {PersonDescriptionTypeNameSet, PersonDescriptionTypes} from './PersonDescriptions';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

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
