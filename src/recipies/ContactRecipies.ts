import {Recipe} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';

declare module '@OneCoreTypes' {
    export interface OneIdObjectInterfaces {
        Profile: Pick<Profile, 'personId' | '$type$'>;
        ContactApp: Pick<ContactApp, 'appId' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        Profile: Profile;
        ContactApp: ContactApp;
    }

    export interface OneUnversionedObjectInterfaces {
        Contact: Contact;
        Someone: Someone;
        OneInstanceEndpoint: OneInstanceEndpoint;
        PersonName: PersonName;
        ProfileImage: ProfileImage;
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
    export type CommunicationEndpointTypes = OneInstanceEndpoint;
    export interface CommunicationEndpoint {}

    export interface OneInstanceEndpoint extends CommunicationEndpoint {
        $type$: 'OneInstanceEndpoint';
        personId: SHA256IdHash<Person>;
        personKeys: SHA256Hash<Keys>;
        instanceKeys: SHA256Hash<Keys>;
    }

    // #### Contact Descriptions #####

    /**
     * This represents a description of a communication partner
     * examples:
     * - name
     * - profile image
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export type ContactDescriptionTypes = PersonName | ProfileImage;
    export interface ContactDescription {}

    export interface PersonName extends ContactDescription {
        $type$: 'PersonName';
        name: string;
    }

    export interface ProfileImage extends ContactDescription {
        $type$: 'ProfileImage';
        image: BLOB;
    }

    // #### Contact / Profile / Someone #####

    /**
     * Contact information about a person. It is not versioned.
     *
     * Those objects can be shared with everybody.
     */
    export interface Contact {
        $type$: 'Contact';
        personId: SHA256IdHash<Person>;
        //communicationEndpoints: SHA256Hash<OneInstanceEndpoint>[];
        //contactDescriptions: SHA256Hash<PersonName | ProfileImage>[];
        communicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[];
        contactDescriptions: SHA256Hash<ContactDescriptionTypes>[];
    }

    /**
     * The profile that describes a person by a collection of contact objects.
     *
     * This is versioned, but the profiles are only shared with instances of the
     * own personal cloud, nobody else.
     */
    export interface Profile {
        $type$: 'Profile';
        personId: SHA256IdHash<Person>;
        mainContact: SHA256Hash<Contact>;
        contactObjects: SHA256Hash<Contact>[];
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
        mainProfile: SHA256IdHash<Profile>;
        profiles: SHA256IdHash<Profile>[];
    }

    // #### Top level ####

    /**
     * This represents the root of the contact management. It is a list of someone objects,
     * so it is a list of persons we know.
     */
    export interface ContactApp {
        $type$: 'ContactApp';
        appId: 'ContactApp'; // since this is a versioned object we need some kind of id ... and this is it
        me: SHA256Hash<Someone>;
        contacts: SHA256Hash<Someone>[];
    }
}

// ######## Recipes ########

export const ProfileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Profile',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'mainContact',
            referenceToObj: new Set(['Contact'])
        },
        {
            itemprop: 'contactObjects',
            referenceToObj: new Set(['Contact']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const ContactRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Contact',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person'])
        },
        {
            itemprop: 'communicationEndpoints',
            referenceToObj: new Set(['OneInstanceEndpoint']),
            list: ORDERED_BY.ONE
        },
        {
            itemprop: 'contactDescriptions',
            referenceToObj: new Set(['PersonName', 'ProfileImage']),
            list: ORDERED_BY.ONE
        }
    ]
};

/*export const CommunicationEndpointRecipe: Recipe = {
    type: 'Recipe',
    name: 'CommunicationEndpoint',
    rule: []
};

export const ContactDescriptionRecipe: Recipe = {
    type: 'Recipe',
    name: 'ContactDescription',
    rule: []
};*/

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
            referenceToObj: new Set(['Someone'])
        },
        {
            itemprop: 'contacts',
            referenceToObj: new Set(['Someone']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const SomeoneRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Someone',
    rule: [
        {
            itemprop: 'mainProfile',
            referenceToId: new Set(['Profile'])
        },
        {
            itemprop: 'profiles',
            referenceToId: new Set(['Profile']),
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
            itemprop: 'personKeys',
            referenceToObj: new Set(['Keys'])
        },
        {
            itemprop: 'instanceKeys',
            referenceToObj: new Set(['Keys'])
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
    name: 'ProfileImage',
    rule: [
        {
            itemprop: 'image',
            referenceToBlob: true
        }
    ]
};

// ######## Authenticated Contact ########

declare module '@OneCoreTypes' {
    export interface OneIdObjectInterfaces {
        AuthenticatedContactsList: Pick<AuthenticatedContactsList, 'instanceIdHash' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        AuthenticatedContactsList: AuthenticatedContactsList;
        AuthenticatedContact: AuthenticatedContact;
    }

    export interface AuthenticatedContact {
        $type$: 'AuthenticatedContact';
        instanceKeysHash: SHA256Hash<Keys>;
        personIdHash: SHA256IdHash<Person>;
        invited: boolean;
    }

    export interface AuthenticatedContactsList {
        $type$: 'AuthenticatedContactsList';
        instanceIdHash: SHA256IdHash<Instance>;
        personalContacts?: SHA256Hash<AuthenticatedContact>[];
        otherContacts?: SHA256Hash<AuthenticatedContact>[];
    }
}

export const AuthenticatedContactRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AuthenticatedContact',
    rule: [
        {
            itemprop: 'instanceKeysHash',
            referenceToObj: new Set(['Keys'])
        },
        {
            itemprop: 'personIdHash',
            optional: true,
            referenceToObj: new Set(['Person'])
        }
    ]
};

export const AuthenticatedContactsListRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AuthenticatedContactsList',
    rule: [
        {
            itemprop: 'instanceIdHash',
            isId: true,
            referenceToObj: new Set(['Instance'])
        },
        {
            itemprop: 'personalContacts',
            referenceToObj: new Set(['AuthenticatedContact']),
            list: ORDERED_BY.ONE
        },
        {
            itemprop: 'otherContacts',
            referenceToObj: new Set(['AuthenticatedContact']),
            list: ORDERED_BY.ONE
        }
    ]
};

// ######## Export recipes ########

const ContactRecipes: Recipe[] = [
    ProfileImageRecipe,
    PersonNameRecipe,
    OneInstanceEndpointRecipe,
    SomeoneRecipe,
    ContactAppRecipe,
    ContactRecipe,
    ProfileRecipe,
    AuthenticatedContactRecipe,
    AuthenticatedContactsListRecipe
];

export default ContactRecipes;
