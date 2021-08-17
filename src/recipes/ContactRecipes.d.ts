import type { BLOB, Instance, Keys, Person, Recipe } from 'one.core/lib/recipes';
import type { UnversionedObjectResult } from 'one.core/lib/storage';
import type { SHA256Hash, SHA256IdHash } from 'one.core/lib/util/type-checks';
declare module '@OneObjectInterfaces' {
    interface OneIdObjectInterfaces {
        Profile: Pick<Profile, 'personId' | '$type$'>;
        ContactApp: Pick<ContactApp, 'appId' | '$type$'>;
    }
    interface OneVersionedObjectInterfaces {
        Profile: Profile;
        ContactApp: ContactApp;
    }
    interface OneUnversionedObjectInterfaces {
        Contact: Contact;
        Someone: Someone;
        OneInstanceEndpoint: OneInstanceEndpoint;
        PersonName: PersonName;
        ProfileImage: ProfileImage;
        Email: Email;
    }
    interface PlanResultTypes {
        '@module/createProfilePicture': {
            args: any;
            result: UnversionedObjectResult<ProfileImage>;
        };
    }
}
/**
 * This represents a way on how to communicate with a person.
 * examples:
 * - address
 * - telephone number
 * - one instance with keys
 */
export declare type CommunicationEndpointTypes = OneInstanceEndpoint | Email;
export interface CommunicationEndpoint {
}
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
/**
 * This represents a description of a communication partner
 * examples:
 * - name
 * - profile image
 */
export declare type ContactDescriptionTypes = PersonName | ProfileImage;
export interface ContactDescription {
}
export interface PersonName extends ContactDescription {
    $type$: 'PersonName';
    name: string;
}
export interface ProfileImage extends ContactDescription {
    $type$: 'ProfileImage';
    image: SHA256Hash<BLOB>;
}
/**
 * Contact information about a person. It is not versioned.
 *
 * Those objects can be shared with everybody.
 */
export interface Contact {
    $type$: 'Contact';
    personId: SHA256IdHash<Person>;
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
/**
 * This represents the root of the contact management. It is a list of someone objects,
 * so it is a list of persons we know.
 */
export interface ContactApp {
    $type$: 'ContactApp';
    appId: 'ContactApp';
    me: SHA256Hash<Someone>;
    contacts: SHA256Hash<Someone>[];
}
export declare const ProfileRecipe: Recipe;
export declare const ContactRecipe: Recipe;
export declare const ContactAppRecipe: Recipe;
export declare const SomeoneRecipe: Recipe;
export declare const OneInstanceEndpointRecipe: Recipe;
export declare const PersonNameRecipe: Recipe;
export declare const ProfileImageRecipe: Recipe;
export declare const EmailRecipe: Recipe;
declare const ContactRecipes: Recipe[];
export default ContactRecipes;
//# sourceMappingURL=ContactRecipes.d.ts.map