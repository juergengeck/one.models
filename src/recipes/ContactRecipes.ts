import {Recipe} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {generateCrdtRecipe} from 'one.core/lib/crdt-recipes';

declare module '@OneCoreTypes' {
    // #### CRDT INTERFACES ####
    export interface OneCrdtObjectInterfaces {
        ProfileCRDT: ProfileCRDT;
    }

    export interface OneCrdtIdObjectInterfaces {
        ProfileCRDT: Pick<ProfileCRDT, 'personId' | 'profileName' | '$type$'>;
    }

    export interface OneCrdtMetaObjectInterfaces {
        ProfileCRDTMetaRecipe: ProfileCRDTMetaData;
    }

    export interface OneCrdtToMetaObjectInterfaces {
        ProfileCRDT: ProfileCRDTMetaData;
    }

    // #### Normal interfaces ####

    export interface OneIdObjectInterfaces {
        ContactApp: Pick<ContactApp, 'appId' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        ContactApp: ContactApp;
    }

    export interface OneUnversionedObjectInterfaces {
        OneInstanceEndpoint: OneInstanceEndpoint;
        PersonName: PersonName;
        ProfileImageRecipe: ProfileImage;
        EmailRecipe: Email;
        Someone: Someone;
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

    /**
     * This object collects all profiles that describe the same person.
     *
     * A person may have multiple person ids, so if someone knows that a person
     * uses several person ids, then it is possible to collect all those alias
     * person ids in one someone object, so that applications can display them
     * as a single person.
     *
     * Should this be versioned?
     * - It doesn't really make sense, because when you look up the corresponding
     *   versioned someone object it might have outdated information. You always
     *   have to go through the app object, no matter what. Reason: The someone
     *   in its current form would refer to the main profile as id ... this means
     *   that if a profile is demoted from "main profile" to "alias profile" it keeps
     *   its versioned object based on its id. So you will not get the someone object
     *   with the correct id! So we need to iterate over all current someone objects
     *   and this can only be done through the App object.
     */
    export interface Someone {
        $type$: 'Someone';
        mainProfile: SHA256IdHash<ProfileCRDT>;
        profiles: SHA256IdHash<ProfileCRDT>[];
    }

    // #### Top level ####

    /**
     * This represents the root of the contact management.
     */
    export interface ContactApp {
        $type$: 'ContactApp';
        appId: 'ContactApp'; // since this is a versioned object we need some kind of id ... and this is it
        me: SHA256Hash<Someone>;
        contacts: SHA256Hash<Someone>[];
    }
}

// ######## Recipes ########

export const ProfileCRDTRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ProfileCRDT',
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
            referenceToId: new Set(['Person'])
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

export const SomeoneRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Someone',
    rule: [
        {
            itemprop: 'mainProfile',
            referenceToId: new Set(['ProfileCRDT'])
        },
        {
            itemprop: 'profiles',
            referenceToId: new Set(['ProfileCRDT']),
            referenceToObj: new Set(['Person']),
            list: ORDERED_BY.ONE
        }
    ]
};

//not crdt
export const ContactAppRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ContactApp',
    rule: [
        {
            itemprop: 'appId',
            regexp: /^ContactApp$/,
            isId: true
        },
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
    EmailRecipe,
    SomeoneRecipe
];

export default ContactRecipes;
