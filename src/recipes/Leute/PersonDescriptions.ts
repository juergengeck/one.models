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

export interface PersonName {
    $type$: 'PersonName';
    name: string;
}

export interface PersonStatus {
    $type$: 'PersonStatus';
    status: string;
}

export interface ProfileImage {
    $type$: 'ProfileImage';
    image: SHA256Hash<BLOB>;
}

// #### type check magic ####

export type PersonDescriptionInterfaces = {
    PersonName: PersonName;
    ProfileImage: ProfileImage;
    PersonStatus: PersonStatus;
};
export type PersonDescriptionTypes = PersonDescriptionInterfaces[keyof PersonDescriptionInterfaces];
export type PersonDescriptionTypeNames = keyof PersonDescriptionInterfaces;

export const PersonDescriptionTypeNameSet = new Set<OneObjectTypeNames | '*'>([
    'PersonName',
    'ProfileImage',
    'PersonStatus'
]);

/**
 * Checks if the description is of a specific description type.
 *
 * @param description
 * @param type
 */
export function isDescriptionOfType<T extends PersonDescriptionTypeNames>(
    description: PersonDescriptionTypes,
    type: T
): description is PersonDescriptionInterfaces[T] {
    return description.$type$ === type;
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
