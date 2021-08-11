import {CRDTMetaData, ORDERED_BY, Person, Recipe} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';
import {
    CommunicationEndpointTypeNameSet,
    CommunicationEndpointTypes
} from './CommunicationEndpoints';
import {ContactDescriptionTypeNameSet, ContactDescriptionTypes} from './PersonDescriptions';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {VersionedObjectResult} from 'one.core/lib/storage';

// #### Typescript interfaces ####

export interface Profile {
    $type$: 'Profile';
    profileId: string;
    personId: SHA256IdHash<Person>;
    owner: SHA256IdHash<Person>;
    communicationEndpoint: SHA256Hash<CommunicationEndpointTypes>[];
    contactDescription: SHA256Hash<ContactDescriptionTypes>[];
}

export interface ProfileCRDTMetaData extends CRDTMetaData<Profile> {
    $type$: 'ProfileCRDTMetaData';
}

// #### Recipes ####

export const ProfileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Profile',
    rule: [
        {
            itemprop: 'profileId',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'owner',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'communicationEndpoint',
            referenceToObj: CommunicationEndpointTypeNameSet,
            list: ORDERED_BY.ONE
        },
        {
            itemprop: 'contactDescription',
            referenceToObj: ContactDescriptionTypeNameSet,
            list: ORDERED_BY.ONE
        }
    ]
};

export const ProfileCRDTDataRecipe: Recipe = generateCrdtRecipe(
    ProfileRecipe,
    'ProfileCRDTMetaData'
);

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneCrdtObjectInterfaces {
        Profile: Profile;
    }

    export interface OneCrdtIdObjectInterfaces {
        Profile: Pick<Profile, '$type$' | 'personId' | 'profileId' | 'owner'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        ProfileCRDTMetaData: ProfileCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        Profile: ProfileCRDTMetaData;
    }

    export interface PlanResultTypes {
        '@module/profileManagerWriteProfile': {
            args: any;
            result: VersionedObjectResult<Profile>;
        };
    }
}

export default [ProfileRecipe, ProfileCRDTDataRecipe];
