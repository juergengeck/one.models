import {BLOB, OneObjectTypeNames, Recipe, SHA256Hash} from "@OneCoreTypes";

/**
 * This represents a description of a communication partner
 * examples:
 * - name
 * - profile image
 * - status
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type ContactDescriptionTypes = PersonName | ProfileImage | PersonStatus;
export const ContactDescriptionTypeNameSet = new Set<OneObjectTypeNames | '*'>(['PersonName', 'ProfileImage', 'PersonStatus']);
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

declare module '@OneCoreTypes' {
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
