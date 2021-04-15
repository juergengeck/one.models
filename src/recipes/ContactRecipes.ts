import {Recipe} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';

declare module '@OneCoreTypes' {
    // #### CRDT INTERFACES ####
    export interface OneCrdtObjectInterfaces {
        ProfileCRDTRecipe: ProfileCRDT;
    }

    export interface OneCrdtIdObjectInterfaces {
        ProfileCRDTRecipe: Pick<ProfileCRDT, '$type$' | 'personId' | 'profileName' | 'author'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        ProfileCRDTMetaRecipe: ProfileCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        ProfileCRDTRecipe: ProfileCRDTMetaData;
    }

    // #### Normal interfaces ####

    export interface OneUnversionedObjectInterfaces {
        OneInstanceEndpoint: OneInstanceEndpoint;
        PersonName: PersonName;
        ProfileImageRecipe: ProfileImage;
        EmailRecipe: Email;
        ContactApp: ContactApp;
    }

    export interface PlanResultTypes {
        '@module/createProfilePicture': {
            args: any;
            result: UnversionedObjectResult<ProfileImage>;
        };
    }

    // #### Communication endpoints #####

    /**
     * This represents a way on how to communicate with a person.
     * examples:
     * - address
     * - telephone number
     * - one instance with keys
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    // @ts-ignore
    export type CommunicationEndpointTypes = OneInstanceEndpoint | Email;
    export interface CommunicationEndpoint {}

    export interface OneInstanceEndpoint extends CommunicationEndpoint {
        $type$: 'OneInstanceEndpoint';
        personId: SHA256IdHash<Person>;
        instanceId: SHA256IdHash<Instance>;
        personKeys: SHA256Hash<Keys> | undefined;
        instanceKeys: SHA256Hash<Keys>;
        url: string;
    }

    export interface Email extends CommunicationEndpoint {
        $type$: 'Email';
        email: string;
    }

    // #### Contact Descriptions #####

    /**
     * This represents a description of a communication partner
     * examples:
     * - name
     * - profile image
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    // @ts-ignore
    export type ContactDescriptionTypes = PersonName | ProfileImage;
    export interface ContactDescription {}

    export interface PersonName extends ContactDescription {
        $type$: 'PersonName';
        name: string;
    }

    export interface ProfileImage extends ContactDescription {
        $type$: 'ProfileImage';
        image: SHA256Hash<BLOB>;
    }

    export interface ProfileCRDT {
        $type$: 'ProfileCRDT';
        personId: SHA256IdHash<Person>;
        profileName: string;
        author: SHA256IdHash<Person>;
        communicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[];
        contactDescriptions: SHA256Hash<ContactDescriptionTypes>[];
    }

    export interface ProfileCRDTMetaData extends CRDTMetaData<ProfileCRDT> {
        $type$: 'ProfileCRDTMetaRecipe';
    }

    // #### Top level ####

    /**
     * This represents the root of the contact management.
     */
    export interface ContactApp {
        $type$: 'ContactApp';
        me: SHA256Hash<Person>;
        contacts: SHA256Hash<Person>[];
    }
}

// ######## Recipes ########

export const ProfileCRDTRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ProfileCRDTRecipe',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'profileName',
            valueType: 'string',

            isId: true
        },
        {
            itemprop: 'author',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'communicationEndpoints',
            referenceToObj: new Set(['OneInstanceEndpoint', 'EmailRecipe']),
            list: ORDERED_BY.ONE
        },
        {
            itemprop: 'contactDescriptions',
            referenceToObj: new Set(['PersonName', 'ProfileImageRecipe']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const ProfileCRDTMetaRecipe: Recipe = generateCrdtRecipe(
    ProfileCRDTRecipe,
    'ProfileCRDTMetaRecipe'
);

//not crdt
export const ContactAppRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ContactApp',
    rule: [
        {
            itemprop: 'me',
            referenceToObj: new Set(['Person'])
        },
        {
            itemprop: 'contacts',
            referenceToObj: new Set(['Person']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const OneInstanceEndpointRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'OneInstanceEndpoint',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person'])
        },
        {
            itemprop: 'instanceId',
            referenceToId: new Set(['Instance'])
        },
        {
            itemprop: 'personKeys',
            referenceToObj: new Set(['Keys']),
            optional: true
        },
        {
            itemprop: 'instanceKeys',
            referenceToObj: new Set(['Keys'])
        },
        {
            itemprop: 'url',
            valueType: 'string'
        }
    ]
};

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

export const ProfileImageRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ProfileImageRecipe',
    rule: [
        {
            itemprop: 'image',
            referenceToBlob: true
        }
    ]
};

export const EmailRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'EmailRecipe',
    rule: [
        {
            itemprop: 'email',
            valueType: 'string'
        }
    ]
};

// ######## Export recipes ########

const ContactRecipes: Recipe[] = [
    ProfileImageRecipe,
    PersonNameRecipe,
    OneInstanceEndpointRecipe,
    ContactAppRecipe,
    ProfileCRDTRecipe,
    ProfileCRDTMetaRecipe,
    EmailRecipe
];

export default ContactRecipes;
