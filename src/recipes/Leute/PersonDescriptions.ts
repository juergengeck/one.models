import type {BLOB, OneObjectTypeNames, Recipe} from 'one.core/lib/recipes';
import type {UnversionedObjectResult} from 'one.core/lib/storage';
import type {SHA256Hash} from 'one.core/lib/util/type-checks';

/**
 * This represents a description of a communication partner
 * examples:
 * - name
 * - profile image
 * - status
 */
export type ContactDescriptionTypes = PersonName | ProfileImage | PersonStatus;
export const ContactDescriptionTypeNameSet = new Set<OneObjectTypeNames | '*'>([
    'PersonName',
    'ProfileImage',
    'PersonStatus'
]);
export interface ContactDescription {}

export interface PersonName extends ContactDescription {
    $type$: 'PersonName';
    name: string;
}

export interface PersonStatus extends ContactDescription {
    $type$: 'PersonStatus';
    status: string;
}

export interface ProfileImage extends ContactDescription {
    $type$: 'ProfileImage';
    image: SHA256Hash<BLOB>;
}

// #### Recipes ####

export const PersonNameRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'PersonName',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string'
        }
    ]
};

export const PersonStatusRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'PersonStatus',
    rule: [
        {
            itemprop: 'status',
            valueType: 'string'
        }
    ]
};

export const ProfileImageRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ProfileImage',
    rule: [
        {
            itemprop: 'image',
            referenceToBlob: true
        }
    ]
};

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        PersonName: PersonName;
        PersonStatus: PersonStatus;
        ProfileImage: ProfileImage;
    }

    export interface PlanResultTypes {
        '@module/createProfilePicture': {
            args: any;
            result: UnversionedObjectResult<ProfileImage>;
        };
    }
}
export default [PersonNameRecipe, PersonStatusRecipe, ProfileImageRecipe];
