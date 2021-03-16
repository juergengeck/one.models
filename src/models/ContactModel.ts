/**
 * @author Erik
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    Contact,
    ContactApp,
    Person,
    SHA256Hash,
    SHA256IdHash,
    Profile,
    Someone,
    VersionedObjectResult,
    ContactDescriptionTypes,
    UnversionedObjectResult,
    OneInstanceEndpoint,
    Keys,
    CommunicationEndpointTypes
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    onUnversionedObj,
    VERSION_UPDATES,
    SetAccessParam,
    SET_ACCESS_MODE,
    onVersionedObj,
    getObjectWithType,
    createSingleObjectThroughImpurePlan,
    readBlobAsArrayBuffer
} from 'one.core/lib/storage';
import {calculateHashOfObj, calculateIdHashOfObj} from 'one.core/lib/util/object';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {serializeWithType} from 'one.core/lib/util/promise';
import EventEmitter from 'events';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import InstancesModel from './InstancesModel';
import ChannelManager from './ChannelManager';
import {getNthVersionMapHash} from 'one.core/lib/version-map-query';
import {createEvent} from '../misc/OEvent';

/**
 * This represents a ContactEvent
 * @enum UpdatedContactList -> this event retrieves ContactApp.obj.contacts ( a list of SHA256Hash<Someones> )
 *       UpdatedContact -> this event retrieves the updated Profile object ( an object of type VersionedObjectResult<Profile> )
 *       UpdatedProfile -> this event retrieves the updated Profile object ( an object of type VersionedObjectResult<Profile> ), when a new contact is added to an existing profile
 *       NewCommunicationEndpointArrived -> this event retrieves the CommunicationEndpoint object from the contact object
 *       UpdatedContactApp -> this event is emitted when th ContactApp is updated
 *       NewContact -> this event retrieves the new contact object ( a object of type UnversionedObjectResult<Contact> )
 */
export enum ContactEvent {
    UpdatedContactList = 'UPDATED_CONTACT_LIST',
    UpdatedContact = 'UPDATED_CONTACT',
    UpdatedProfile = 'UPDATE_PROFILE',
    NewCommunicationEndpointArrived = 'NEW_ENDPOINT_ARRIVED',
    UpdatedContactApp = 'UPDATED_CONTACT_APP',
    NewContact = 'NEW_CONTACT'
}

/**
 * This represents the object types of the contact description
 * @enum PERSON_NAME -> the type of object that will store the person's name
 *       PROFILE_IMAGE -> the type of object that will store the person's profile image
 */
export enum DescriptionTypes {
    PERSON_NAME = 'PersonName',
    PROFILE_IMAGE = 'ProfileImage'
}

/**
 * This represents the object types of the communication endpoints
 * @enum EMAIL -> the type of object that will store the person's email
 */
export enum CommunicationEndpointsTypes {
    EMAIL = 'Email'
}

/**
 * This represents the current contact description fields that can be provided by the user.
 */
export type ContactDescription = {
    personName?: string;
    image?: ArrayBuffer;
};

/**
 * This represents the current contact communicationEndpoint fields that can be provided by the user.
 */
export type CommunicationEndpoint = {
    email?: string;
};

/**
 * This represents the metadata of a profile property.
 */
export type Meta = {
    isMain: boolean;
};

/**
 * This represents the information from a contact object.
 */
export type Info = {
    value: string | ArrayBuffer;
    meta: Meta;
};

/**
 * The merged information from all contact objects of a profile.
 */
export type MergedContact = {
    type: string;
    info: Info[];
};

/**
 *
 * @description Contact Model class
 * @augments EventEmitter
 */
export default class ContactModel extends EventEmitter {
    /**
     * Event emitted when a new contact is added.
     */
    public onContactListUpdate = createEvent<(contacts: SHA256Hash<Someone>[]) => void>();
    /**
     * Event emitted when a contact is updated.
     */
    public onContactUpdate = createEvent<(profile: VersionedObjectResult<Profile>) => void>();
    /**
     * Event is emitted when the profile is updated with a new contact object.
     */
    public onProfileUpdate = createEvent<(profile: VersionedObjectResult<Profile>) => void>();
    /**
     * Event is emitted when:
     * - a new profile for myself is created
     * - a new contact object is created
     * - profile is updated with a new contact object
     */
    public onNewCommunicationEndpointArrive = createEvent<
        (communicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[]) => void
    >();
    /**
     * Event is emitted when new ContactApp object is updated.
     */
    public onContactAppUpdate = createEvent<() => void>();
    /**
     * Event is emitted when:
     * - a new contact object is created
     * - profile is updated with a new contact object
     */
    public onContactNew = createEvent<(caughtObject: UnversionedObjectResult<Contact>) => void>();

    private readonly instancesModel: InstancesModel;
    private readonly commServerUrl: string;
    // @ts-ignore
    private readonly channelManager: ChannelManager; // Let's keep it for now, because we will need it later again!
    private readonly boundOnVersionedObjHandler: (
        caughtObject: VersionedObjectResult
    ) => Promise<void>;
    private readonly boundOnUnVersionedObjHandler: (
        caughtObject: UnversionedObjectResult
    ) => Promise<void>;

    constructor(
        instancesModel: InstancesModel,
        commServerUrl: string,
        channelManager: ChannelManager
    ) {
        super();
        this.instancesModel = instancesModel;
        this.commServerUrl = commServerUrl;
        this.channelManager = channelManager;
        this.boundOnVersionedObjHandler = this.handleOnVersionedObj.bind(this);
        this.boundOnUnVersionedObjHandler = this.handleOnUnVersionedObj.bind(this);
    }

    /** ########################################## Public ########################################## **/

    /**
     * Initialize the structure. This has to be called after the one instance is initialized.
     *
     * @param takeOver - Set to true if a takeover (IoM Pairing) took place. In this case an instance endpoint
     * without the person key is generated. This is a workaround so that the temporary person keys generated
     * before the takeover don't show up in any contact objects.
     */
    public async init(takeOver?: boolean): Promise<void> {
        /** if the contactApp exists, the structure must not be initialised, otherwise will be overwritten **/
        if (!(await ContactModel.doesContactAppObjectExist())) {
            await createSingleObjectThroughPurePlan(
                {module: '@module/setupInitialProfile'},
                this.commServerUrl,
                takeOver
            );
        } else {
            const contactObjectIdHash = await calculateIdHashOfObj({
                $type$: 'ContactApp',
                appId: 'ContactApp'
            });
            await createSingleObjectThroughImpurePlan(
                {module: '@module/mergeContactApp'},
                contactObjectIdHash
            );
        }

        // Listen for new contact app objects -> own profiles
        onVersionedObj.addListener(this.boundOnVersionedObjHandler);

        // Listen for new contact objects
        onUnversionedObj.addListener(this.boundOnUnVersionedObjHandler);

        await ContactModel.shareContactAppWithYourInstances();
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        onVersionedObj.removeListener(this.boundOnVersionedObjHandler);
        onUnversionedObj.removeListener(this.boundOnUnVersionedObjHandler);
    }

    /** ###################### Identity management ###################### **/

    /**
     * Create a new personId and an associated profile.
     *
     * @param myself - flag that specifies whether the identity should be for me(if true) or another person(if false)
     * @param email - the email address
     * @param takeOver - Set to true if a takeover (IoM Pairing) took place. In this case an instance endpoint
     * without the person key is generated. This is a workaround so that the temporary person keys generated
     * before the takeover don't show up in any contact objects.
     * @returns the SHA256IdHash of the new created profile
     */
    public async createNewIdentity(
        myself: boolean,
        email?: string,
        takeOver?: boolean
    ): Promise<SHA256IdHash<Person>> {
        const personEmail = email === undefined ? await createRandomString(20) : email;

        const createdProfile = await this.serializeProfileCreatingByPersonEmail(
            personEmail,
            myself,
            takeOver
        );
        return createdProfile.obj.personId;
    }

    /**
     * Return my main identity.
     *
     * @returns the SHA256IdHash of my main profile
     */
    public async myMainIdentity(): Promise<SHA256IdHash<Person>> {
        const contactApp = await ContactModel.getContactAppObject();
        const mySomeoneObject = await getObject(contactApp.obj.me);
        return (await getObjectByIdHash(mySomeoneObject.mainProfile)).obj.personId;
    }

    /**
     * Get own profile identities. It returns the person id hashes for all profiles gathered in my own Someone object.
     *
     * @returns the list of SHA256IdHashes for my profiles
     */
    public async myIdentities(): Promise<SHA256IdHash<Person>[]> {
        const contactApp = await ContactModel.getContactAppObject();
        /**  find my own someone object **/
        const mySomeoneObject = await getObject(contactApp.obj.me);

        /** Iterate over all profile objects in someone object and add the person id hash
         *  to the return list
         **/
        return await Promise.all(
            mySomeoneObject.profiles.map(
                async (profileIdHash: SHA256IdHash<Profile>) =>
                    (await getObjectByIdHash(profileIdHash)).obj.personId
            )
        );
    }

    /**
     * Get profile identities of others. It returns the person id hashes for all profiles gathered in the Someone object
     * for the personId, given by parameter.
     *
     * @param personId - the person id for which to search for alternate ids
     * @param excludeMain - if true then it will exclude the main profile, if false then it will include it. Its default value is false
     * @returns the list of SHA256IdHashes for other profiles
     */
    public async listAlternateIdentities(
        personId: SHA256IdHash<Person>,
        excludeMain: boolean = false
    ): Promise<SHA256IdHash<Person>[]> {
        // Find the someone object that references the passed person id hash
        const otherPersonSomeoneObject = await this.getSomeoneObject(personId);

        // If someone object does not exist, then just return the current id
        if (otherPersonSomeoneObject === undefined) {
            if (excludeMain) {
                return [];
            } else {
                return [personId];
            }
        }

        // Iterate over all profiles and extract their ids
        let identities = await Promise.all(
            otherPersonSomeoneObject.profiles.map(
                async (profileIdHash: SHA256IdHash<Profile>) =>
                    (await getObjectByIdHash(profileIdHash)).obj.personId
            )
        );

        // Remove the main id if requested
        if (excludeMain) {
            identities = identities.filter(id => id !== personId);
        }

        return identities;
    }

    /**
     * @todo pure plan next weeks
     * Merge two Someone objects into one single someone object.
     * The merge is refused if one of the person ids belongs to a secondary profile
     *
     * @param personA - this profile will always become the main profile
     * @param personB - this profile will always become a secondary profile
     */
    public async declareSamePerson(
        personA: SHA256IdHash<Person>,
        personB: SHA256IdHash<Person>
    ): Promise<void> {
        const contactApp = await ContactModel.getContactAppObject();

        const someoneA = await this.getSomeoneObject(personA);
        const someoneB = await this.getSomeoneObject(personB);

        /** Checking if the profiles do exist **/
        if (someoneA === undefined || someoneB === undefined) {
            throw new Error('Error: at least one profile is missing');
        }

        const profileA = await getObjectByIdHash(someoneA.mainProfile);
        const profileB = await getObjectByIdHash(someoneB.mainProfile);

        /** if the given person ids are not part of a main profile **/
        if (profileA.obj.personId !== personA || profileB.obj.personId !== personB) {
            throw new Error(
                'Error: could not merge the profiles, at least one profile is not labeled as main profile'
            );
        }

        const someoneAHash = await calculateHashOfObj(someoneA);
        const someoneBHash = await calculateHashOfObj(someoneB);

        /** remove the previous someone objects from the contactApp object **/
        contactApp.obj.contacts = contactApp.obj.contacts.filter(
            (someoneHash: SHA256Hash<Someone>) =>
                ![someoneAHash, someoneBHash].includes(someoneHash)
        );

        /** merge into one single someone object **/
        const updatedSomeoneObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                $type$: 'Someone',
                mainProfile: profileA.idHash,
                /** remove the duplicates **/
                profiles: Array.from(new Set([...someoneA.profiles, ...someoneB.profiles]))
            }
        );

        /** update the contactApp **/
        contactApp.obj.contacts.push(updatedSomeoneObject.hash);
        /** save the changes in the contactApp **/
        await createSingleObjectThroughPurePlan({module: '@one/identity'}, contactApp.obj);
    }

    /** ###################### Managing contacts ###################### **/

    /**
     * Return the person id of each main profile of Someone object.
     *
     * @returns person id list
     */
    public async contacts(): Promise<SHA256IdHash<Person>[]> {
        const contactApp = await ContactModel.getContactAppObject();
        const contactsSomeone = await Promise.all(
            contactApp.obj.contacts.map(async (contactHash: SHA256Hash<Someone>) => {
                return await getObject(contactHash);
            })
        );
        const contactsProfiles = await Promise.all(
            contactsSomeone.map(async (someone: Someone) => {
                return await getObjectByIdHash(someone.mainProfile);
            })
        );
        return contactsProfiles.map(
            (profile: VersionedObjectResult<Profile>) => profile.obj.personId
        );
    }

    /** ###################### Contact object management ###################### **/

    /**
     * Return the main contact object from a profile associated with the given personId.
     *
     * @param personId - the given person id
     * @returns the contact
     */
    public async getMainContactObject(personId: SHA256IdHash<Person>): Promise<Contact> {
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        return await getObject(personProfile.obj.mainContact);
    }

    /**
     * Return a list of Contact objects from a profile associated with the given personId.
     *
     * @param personId - the given person id
     * @returns the contacts list
     */
    public async getContactObjects(personId: SHA256IdHash<Person>): Promise<Contact[]> {
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        return Promise.all(
            personProfile.obj.contactObjects.map(
                async (contactHash: SHA256Hash<Contact>) => await getObject(contactHash)
            )
        );
    }

    /**
     * Return a list of hashes of Contact Objects from a profile associated with the given personId.
     *
     * @param personId - the given person id
     * @returns the contact ids list
     */
    public async getContactObjectHashes(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256Hash<Contact>[]> {
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        return personProfile.obj.contactObjects;
    }

    /**
     * Return the name of the Someone object from the main profile.
     * At the beginning the name is searched in the main contact object of the profile,
     * if there is no name description then the search is proceed over the contact object list.
     *
     * @param personId - the person id for whom the name search is performed
     * @returns the name or an empty string if the name description wasn't found
     */
    public async getName(personId: SHA256IdHash<Person>): Promise<string> {
        const mainProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});

        let someoneName = '';

        if (mainProfile) {
            // get main contact of the main profile
            const mainContact = await getObject(mainProfile.obj.mainContact);

            someoneName = await this.getNameDescription(mainContact);

            // if the main contact doesn't contains a name then iterate over
            // the list of contact objects of the profile and grab first name
            if (someoneName === '') {
                const contactObjects = await this.getContactObjects(personId);

                // iterate over the contact objects
                for (const contact of contactObjects) {
                    someoneName = await this.getNameDescription(contact);
                    if (someoneName !== '') {
                        return someoneName;
                    }
                }
            }
        }

        return someoneName;
    }

    /**
     * The merging algorithm for the contacts object of a profile.
     * For now it will return always the person names, the profile images and the emails
     * for the main profile of someone.
     *
     * @param personId - the idHash of the person
     * @param isMainProfileRequested - a flag for switching between merging logic. Its default value is true,
     * which means that it will return the information only from the main profile
     * @returns merged contact objects.
     */
    public async getMergedContactObjects(
        personId: SHA256IdHash<Person>,
        isMainProfileRequested: boolean = true
    ): Promise<MergedContact[]> {
        const mergedContacts: MergedContact[] = [];
        const profileImageInfos: Info[] = [];
        const personNameInfo: Info[] = [];
        const emailInfos: Info[] = [];

        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        const mainContactHash = personProfile.obj.mainContact;
        // getting the list of contacts of the main profile
        const contactHashes = await this.getContactObjectHashes(personId);

        if (isMainProfileRequested) {
            // iterating over the contact objects list
            for (const contactHash of contactHashes) {
                const isMain = contactHash === mainContactHash;
                const contact = await getObject(contactHash);
                // getting the description of the contact
                const contactDescriptions = await this.getContactDescriptions(contact);

                // getting the contact description and adding it into the returned array
                for (const description of contactDescriptions) {
                    if (description.$type$ === DescriptionTypes.PERSON_NAME) {
                        ContactModel.addInformationIfNotExist(personNameInfo, {
                            value: description.name,
                            meta: {isMain: isMain}
                        });
                    }

                    if (description.$type$ === DescriptionTypes.PROFILE_IMAGE) {
                        const image = await readBlobAsArrayBuffer(description.image);
                        ContactModel.addInformationIfNotExist(profileImageInfos, {
                            value: image,
                            meta: {isMain: isMain}
                        });
                    }
                }

                // getting the communication endpoints of the contact
                const communicationEndpoints = await this.getContactCommunicationEndpoints(contact);

                // getting the contact communication endpoints and adding them into the returned array
                for (const communicationEndpoint of communicationEndpoints) {
                    if (communicationEndpoint.$type$ === CommunicationEndpointsTypes.EMAIL) {
                        ContactModel.addInformationIfNotExist(emailInfos, {
                            value: communicationEndpoint.email,
                            meta: {isMain: isMain}
                        });
                    }
                }
            }
        } else {
            //@TODO - implement the merge of the profiles of someone
        }

        // adding the merged profile images objects
        mergedContacts.push({
            type: DescriptionTypes.PROFILE_IMAGE,
            info: profileImageInfos
        });

        // adding the merged person names objects
        mergedContacts.push({
            type: DescriptionTypes.PERSON_NAME,
            info: personNameInfo
        });

        // adding the merged emails objects
        mergedContacts.push({
            type: CommunicationEndpointsTypes.EMAIL,
            info: emailInfos
        });

        return mergedContacts;
    }

    /**
     * Update the main contact of a person based on the contactDescription object.
     * (e.g. if the current main contact contains just an avatar and the incoming contactDescription contains a person name
     * then the new main contact will contains both, the avatar from previous main contact and the person name from the contactDescription object.)
     *
     * @param personId - the id of the person whose main contact will be updated
     * @param contactDescription - the new values of the main contact object
     */
    public async updateDescription(
        personId: SHA256IdHash<Person>,
        contactDescription: ContactDescription
    ): Promise<void> {
        let newContactDescriptions: UnversionedObjectResult<ContactDescriptionTypes>[] = [];

        if (contactDescription.personName) {
            // creates the personName object
            newContactDescriptions.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {$type$: DescriptionTypes.PERSON_NAME, name: contactDescription.personName}
                )
            );
        } else if (contactDescription.image) {
            // creates the profileImage object
            newContactDescriptions.push(
                await createSingleObjectThroughImpurePlan(
                    {
                        module: '@module/createProfilePicture',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    contactDescription.image
                )
            );
        }

        await this.updateContactContent(personId, true, newContactDescriptions);
    }

    /**
     * Update the main contact of a person based on the communication endpoint object.
     * For now it update only the email of the main contact.
     *
     * @param personId - the given person id
     * @param communicationEndpoint - the new communication endpoints information
     */
    public async updateCommunicationEndpoint(
        personId: SHA256IdHash<Person>,
        communicationEndpoint: CommunicationEndpoint
    ): Promise<void> {
        let newCommunicationEndpoints: UnversionedObjectResult<CommunicationEndpointTypes>[] = [];

        if (communicationEndpoint.email) {
            // creates the email object
            newCommunicationEndpoints.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {$type$: CommunicationEndpointsTypes.EMAIL, email: communicationEndpoint.email}
                )
            );
        }

        await this.updateContactContent(personId, false, newCommunicationEndpoints);
    }

    /**
     * Find instance endpoints objects for contacts / or for me.
     *
     * @param forMe - if true then all endpoints for myself, if false then all endpoints of contacts
     * @param onlyMain - if forMe is true then this selects between all my ids, or just my main id
     * @returns the list of OneInstanceEndpoints
     */
    public async findAllOneInstanceEndpoints(
        forMe: boolean = false,
        onlyMain: boolean = false
    ): Promise<OneInstanceEndpoint[]> {
        // Get all person ids of all persons (or for myself) as 1-dim array
        let allIdsPromise: Promise<SHA256IdHash<Person>[]>[];
        if (forMe) {
            if (onlyMain) {
                allIdsPromise = [Promise.resolve([await this.myMainIdentity()])];
            } else {
                allIdsPromise = [this.myIdentities()];
            }
        } else {
            allIdsPromise = (await this.contacts()).map(personId =>
                this.listAlternateIdentities(personId)
            );
        }
        const allIdsNonFlat: SHA256IdHash<Person>[][] = await Promise.all(allIdsPromise);
        const allIds: SHA256IdHash<Person>[] = allIdsNonFlat.reduce(
            (acc, curr) => acc.concat(curr),
            []
        );

        // Get all contact objects as 1-dim array
        const allContactObjectsNonFlat: Contact[][] = await Promise.all(
            allIds.map(id => this.getContactObjects(id))
        );
        const allContactObjects = allContactObjectsNonFlat.reduce(
            (acc, curr) => acc.concat(curr),
            []
        );

        // Get all endpoints as 1-dim array
        const allEndpointHashesNonFlat = allContactObjects.map(cobj => cobj.communicationEndpoints);
        const allEndpointHashes = allEndpointHashesNonFlat.reduce(
            (acc, curr) => acc.concat(curr),
            []
        );
        const allEndpoints = await Promise.all(allEndpointHashes.map(hash => getObject(hash)));
        const oneInstanceEndpoints: OneInstanceEndpoint[] = [];

        // Get all OneInstanceEndpoints
        for (const oneInstance of allEndpoints) {
            if (oneInstance.$type$ === 'OneInstanceEndpoint') {
                oneInstanceEndpoints.push(oneInstance);
            }
        }

        return oneInstanceEndpoints;
    }

    /**
     * Return the person keys for a specific person.
     *
     * @param personId - the given person id
     * @returns the list of keys
     */
    public async personKeysForPerson(personId: SHA256IdHash<Person>): Promise<Keys> {
        const personKeyLink = await getAllValues(personId, true, 'Keys');
        return await getObjectWithType(personKeyLink[personKeyLink.length - 1].toHash, 'Keys');
    }

    /** ########################################## Private ########################################## **/

    /**
     * !!! Any action on the contactApp object must be serialized
     *  Return the VersionedObjectResult of the ContactApp.
     *
     * @returns the VersionedObjectResult of the ContactApp
     */
    private static async getContactAppObject(): Promise<VersionedObjectResult<ContactApp>> {
        return await serializeWithType('ContactApp', async () => {
            return await getObjectByIdObj({$type$: 'ContactApp', appId: 'ContactApp'});
        });
    }

    /**
     * Retrieve the Someone object for a given personId.
     *
     * @param personId - the given person id
     * @returns the Someone object if it exists, otherwise undefined
     */
    private async getSomeoneObject(personId: SHA256IdHash<Person>): Promise<Someone | undefined> {
        const contactApp = await ContactModel.getContactAppObject();
        /** get the person profile, if it doesn't exist, it means it doesn't exist in the Someone object either **/
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId}).catch(
            (ignored: Error) => undefined
        );

        if (personProfile === undefined) {
            return undefined;
        }

        /** get all the Someone objects in a list **/
        const someoneObjects = await Promise.all(
            contactApp.obj.contacts.map(async (someoneHash: SHA256Hash<Someone>) => {
                return await getObject(someoneHash);
            })
        );

        /** search for the profile **/
        const foundSomeone: Someone | undefined = someoneObjects.find((someone: Someone) => {
            return someone.profiles.find(
                (profile: SHA256IdHash<Profile>) => profile === personProfile.idHash
            );
        });

        if (foundSomeone === undefined) {
            return undefined;
        }

        const foundSomeoneHash = await calculateHashOfObj(foundSomeone);
        /** return the exploded someone object **/
        return await getObject(foundSomeoneHash);
    }

    /**
     * HOOK function: Serialized since it's part of an object listener or not
     *
     * @param profile - the given profile
     */
    private async registerNewSelfProfile(profile: VersionedObjectResult<Profile>): Promise<void> {
        const contactApp = await ContactModel.getContactAppObject();
        const mySomeoneObject = await getObject(contactApp.obj.me);

        /** adding the new profile to your profiles **/
        mySomeoneObject.profiles.push(profile.idHash);

        /** saving the updates **/
        const updatedSomeone = await serializeWithType(
            await calculateHashOfObj(mySomeoneObject),
            async () => {
                return await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    mySomeoneObject
                );
            }
        );
        contactApp.obj.me = updatedSomeone.hash;

        /** saving the contact app **/
        await serializeWithType('ContactApp', async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                contactApp.obj
            );
        });
    }

    /**
     * Serialize the profile creation wrapper
     *
     * @param personEmail - the email address
     * @param forMyself - flag that specifies whether the profile should be for me(if true) or another person(if false)
     * @param takeOver - Set to true if a takeover (IoM Pairing) took place. In this case an instance endpoint
     * without the person key is generated. This is a workaround so that the temporary person keys generated
     * before the takeover don't show up in any contact objects.
     * @returns the VersionedObjectResult of the profile
     */
    private async serializeProfileCreatingByPersonEmail(
        personEmail: string,
        forMyself: boolean,
        takeOver?: boolean
    ): Promise<VersionedObjectResult<Profile>> {
        // Create a profile for myself
        if (forMyself) {
            return await serializeWithType('Contacts', async () => {
                // Create the local instance including the instance keys
                const createdInstance = await this.instancesModel.createLocalInstanceByEMail(
                    personEmail
                );

                // Create relevant profile objects
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createOwnProfile'},
                    personEmail,
                    createdInstance,
                    this.commServerUrl,
                    takeOver
                )) as VersionedObjectResult<Profile>;

                // Add the profile to the someone object
                await this.registerNewSelfProfile(profile);

                const contactObjects = await Promise.all(
                    profile.obj.contactObjects.map(async (contact: SHA256Hash<Contact>) => {
                        return await getObject(contact);
                    })
                );

                this.onNewCommunicationEndpointArrive.emit(
                    contactObjects[0].communicationEndpoints
                );
                this.emit(
                    ContactEvent.NewCommunicationEndpointArrived,
                    contactObjects[0].communicationEndpoints
                );
                return profile;
            });

            // Create a profile for others
        } else {
            return await serializeWithType('Contacts', async () => {
                // Just create the person id and the relevant profile objects
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createProfile'},
                    personEmail
                )) as VersionedObjectResult<Profile>;

                // Add the profile to the someone object (or create a new one)
                await this.registerProfile(profile);
                return profile;
            });
        }
    }

    /**
     * Check if the contactApp was created for this particular instance
     *
     * @returns true, if there is ContactApp, otherwise false
     */
    private static async doesContactAppObjectExist(): Promise<boolean> {
        try {
            await getObjectByIdObj({$type$: 'ContactApp', appId: 'ContactApp'});
            return true;
        } catch (ignored) {
            return false;
        }
    }

    /**
     * Handler function for the VersionedObj event
     *
     * @param caughtObject - the caught object
     */
    private async handleOnVersionedObj(caughtObject: VersionedObjectResult): Promise<void> {
        if (ContactModel.isContactAppVersionedObjectResult(caughtObject)) {
            // Get the profiles of myself
            const updatedSomeoneObjectForMyself = await getObject(caughtObject.obj.me);
            const profiles = await Promise.all(
                updatedSomeoneObjectForMyself.profiles.map(
                    async (profileIdHash: SHA256IdHash<Profile>) => {
                        return await getObjectByIdHash(profileIdHash);
                    }
                )
            );

            // Iterate over profiles and check which profile does not have a local instance -> generate them
            await Promise.all(
                profiles.map(async (profile: VersionedObjectResult<Profile>) => {
                    if (await this.instancesModel.hasPersonLocalInstance(profile.obj.personId)) {
                        return;
                    }

                    // Create profile for this
                    const personEmail = (await getObjectByIdHash(profile.obj.personId)).obj.email;
                    await this.serializeProfileCreatingByPersonEmail(personEmail, true);
                })
            );

            await serializeWithType('ContactApp', async () => {
                try {
                    const firstPreviousContactObjectHash = await getNthVersionMapHash(
                        caughtObject.idHash,
                        -1
                    );
                    if (firstPreviousContactObjectHash !== caughtObject.hash) {
                        await createSingleObjectThroughImpurePlan(
                            {module: '@module/mergeContactApp'},
                            caughtObject.idHash
                        );
                    }
                } catch (_) {
                    return;
                }
            });

            this.emit(ContactEvent.UpdatedContactApp);
            this.onContactAppUpdate.emit();
        }
        if (ContactModel.isProfileVersionedObjectResult(caughtObject)) {
            await serializeWithType('Contacts', async () => {
                try {
                    const firstPreviousProfileObjectHash = await getNthVersionMapHash(
                        caughtObject.idHash,
                        -1
                    );
                    if (firstPreviousProfileObjectHash !== caughtObject.hash) {
                        await createSingleObjectThroughImpurePlan(
                            {module: '@module/mergeProfile'},
                            caughtObject.idHash
                        );
                    }
                } catch (_) {
                    return;
                }
            });
        }
    }

    /**
     * Handler function for the UnVersionedObj event
     *
     * @param caughtObject - the caught object
     */
    private async handleOnUnVersionedObj(caughtObject: UnversionedObjectResult): Promise<void> {
        if (ContactModel.isContactUnVersionedObjectResult(caughtObject)) {
            await serializeWithType('Contacts', async () => {
                const personId = caughtObject.obj.personId;
                const personEmail = (await getObjectByIdHash(personId)).obj.email;

                let profile: VersionedObjectResult<Profile>;
                /** see if the profile does exist **/
                try {
                    profile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
                } catch (e) {
                    /** otherwise create a new profile and register it with serialization **/
                    profile = (await createSingleObjectThroughPurePlan(
                        {module: '@module/createProfile'},
                        personEmail
                    )) as VersionedObjectResult<Profile>;

                    // Add the profile to the someone object (or create a new one)
                    await this.registerProfile(profile);
                }
                const existingContact = profile.obj.contactObjects.find(
                    (contactHash: SHA256Hash<Contact>) => contactHash === caughtObject.hash
                );

                // Emit the signals before filtering for already existing contacts because
                // This code might fetch a profile "from the future" (after the callback here was started)
                // So this object might already exist in the profile, because the new profile version was
                // synchronized. So emit the signals before returning!
                this.emit(ContactEvent.UpdatedContact, profile);
                this.onContactUpdate.emit(profile);
                this.emit(
                    ContactEvent.NewCommunicationEndpointArrived,
                    caughtObject.obj.communicationEndpoints
                );
                this.onNewCommunicationEndpointArrive.emit(caughtObject.obj.communicationEndpoints);
                this.emit(ContactEvent.NewContact, caughtObject);
                this.onContactNew.emit(caughtObject);
                // if the profile was just created, use the latest contact that arrived as a main contact and don't let an empty contact
                if (profile.status === 'new') {
                    profile.obj.mainContact = caughtObject.hash;
                }

                // Do not write a new profile version if this contact object is already part of it
                // This also might happen when a new profile object is synchronized with a new contact
                // object, because the synchronized profile object already references this contact object
                if (!existingContact) {
                    profile.obj.contactObjects.push(caughtObject.hash);
                }

                /** update the profile **/
                return await createSingleObjectThroughImpurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    profile.obj
                );
            });
        }
    }

    /**
     * Check if the VersionedObjectResult object given as a parameter is a ContactApp object.
     *
     * @param caughtObject - the caught object
     * @returns true, if the caught object is a ContactApp object, otherwise false
     */
    private static isContactAppVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<ContactApp> {
        return (caughtObject as VersionedObjectResult<ContactApp>).obj.$type$ === 'ContactApp';
    }

    /**
     * Check if the VersionedObjectResult object given as a parameter is a Profile object.
     *
     * @param caughtObject - the caught object
     * @returns true, if the caught object is a Profile object, otherwise false
     */
    private static isProfileVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<Profile> {
        return (caughtObject as VersionedObjectResult<Profile>).obj.$type$ === 'Profile';
    }

    /**
     * Check if the UnversionedObjectResult object given as a parameter is a Contact object.
     *
     * @param caughtObject - the caught object
     * @returns true, if the caught object is a Contact object, otherwise false
     */
    private static isContactUnVersionedObjectResult(
        caughtObject: UnversionedObjectResult
    ): caughtObject is UnversionedObjectResult<Contact> {
        return (caughtObject as UnversionedObjectResult<Contact>).obj.$type$ === 'Contact';
    }

    /**
     * Private utility function which is used to register another person profile.
     *
     * @param profile - the given profile
     */
    private async registerProfile(profile: VersionedObjectResult<Profile>): Promise<void> {
        const contactApp = await ContactModel.getContactAppObject();
        const someoneObject = await this.getSomeoneObject(profile.obj.personId);

        /** check if the someone object exists **/
        if (someoneObject === undefined) {
            /** if not, create a new someone object **/
            const updatedSomeoneObject = await createSingleObjectThroughPurePlan(
                {module: '@one/identity'},
                {
                    $type$: 'Someone',
                    mainProfile: profile.idHash,
                    profiles: [profile.idHash]
                }
            );

            /** update the contactApp **/
            contactApp.obj.contacts.push(updatedSomeoneObject.hash);

            /** save the contactApp **/
            await serializeWithType('ContactApp', async () => {
                return await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    contactApp.obj
                );
            });
            this.emit(ContactEvent.UpdatedContactList, contactApp.obj.contacts);
            this.onContactListUpdate.emit(contactApp.obj.contacts);
        }
    }

    /**
     * Share the ContactApp object with your instance
     */
    private static async shareContactAppWithYourInstances(): Promise<void> {
        const contactAppVersionedObjectResult = await ContactModel.getContactAppObject();
        const personIdHash = getInstanceOwnerIdHash();

        if (personIdHash === undefined) {
            return;
        }

        const setAccessParam: SetAccessParam = {
            group: [],
            id: contactAppVersionedObjectResult.idHash,
            mode: SET_ACCESS_MODE.REPLACE,
            person: [personIdHash]
        };
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
    }

    /**
     * Update the Profile object with a new Contact object.
     *
     * @param  profile - the given profile object
     * @param contactObject - the given contact object
     */
    private async updateProfile(
        profile: VersionedObjectResult<Profile>,
        contactObject: UnversionedObjectResult<Contact>
    ): Promise<void> {
        const existingContact = profile.obj.contactObjects.find(
            (contactHash: SHA256Hash<Contact>) => contactHash === contactObject!.hash
        );
        if (existingContact === undefined) {
            profile.obj.contactObjects.push(contactObject.hash);
        }

        profile.obj.mainContact = contactObject.hash;

        /** update the profile **/
        await serializeWithType('Contacts', async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                profile.obj
            );
        });

        this.emit(ContactEvent.UpdatedProfile, profile);
        this.onProfileUpdate.emit(profile);
        this.emit(ContactEvent.NewContact, contactObject);
        this.onContactNew.emit(contactObject);
        if (existingContact === undefined) {
            this.emit(
                ContactEvent.NewCommunicationEndpointArrived,
                contactObject.obj.communicationEndpoints
            );
            this.onNewCommunicationEndpointArrive.emit(contactObject.obj.communicationEndpoints);
        }
    }

    /**
     * Return the person name description from a contact object.
     * If there is no name in the given Contact object as a parameter, it will return an empty string.
     *
     * @param contact - the given contact object
     * @returns the name that was found or empty string
     */
    private async getNameDescription(contact: Contact): Promise<string> {
        // get the descriptions of each contact object
        const contactDescriptions = await this.getContactDescriptions(contact);

        // iterate over the contact descriptions and search for name
        for (const description of contactDescriptions) {
            if (description.$type$ === DescriptionTypes.PERSON_NAME) {
                return description.name;
            }
        }

        return '';
    }

    /**
     * Build the merged object that contains all the information from the contact objects.
     *
     * @param existingInformation - the array that contains the information.
     * @param informationToBeAdded - new element that should be added into the array.
     */
    private static addInformationIfNotExist(
        existingInformation: Info[],
        informationToBeAdded: Info
    ): void {
        // @TODO - consider also the meta object while comparing the objects!!! - ignored atm because it's empty

        const info = existingInformation.findIndex(
            (info: Info) =>
                info.value === informationToBeAdded.value ||
                (info.value instanceof ArrayBuffer &&
                    informationToBeAdded.value instanceof ArrayBuffer &&
                    ContactModel.areArrayBuffersEquals(info.value, informationToBeAdded.value))
        );

        if (info === -1) {
            existingInformation.push(informationToBeAdded);
        } else {
            // but if a specific contact is set as a main contact
            if (existingInformation[info].meta.isMain !== informationToBeAdded.meta.isMain) {
                existingInformation[info] = informationToBeAdded;
            }
        }
    }

    /**
     * Compare two images to see if they are equal.
     * NOTE: maybe it will be nice if we will have some file for utils functions like this one.
     *
     * @param arrayBuffer1 - first array buffer.
     * @param arrayBuffer2 - second array buffer.
     * @returns true, if images are equal, otherwise false
     */
    private static areArrayBuffersEquals(
        arrayBuffer1: ArrayBuffer,
        arrayBuffer2: ArrayBuffer
    ): boolean {
        if (arrayBuffer1.byteLength != arrayBuffer2.byteLength) return false;
        const dataView1 = new Int8Array(arrayBuffer1);
        const dataView2 = new Int8Array(arrayBuffer2);
        for (let i = 0; i != arrayBuffer1.byteLength; i++) {
            if (dataView1[i] != dataView2[i]) return false;
        }
        return true;
    }

    /**
     * Return the contact descriptions linked to the given contact object.
     *
     * @param contact - the given contact object.
     * @returns the contact description
     */
    private async getContactDescriptions(contact: Contact): Promise<ContactDescriptionTypes[]> {
        return await Promise.all(
            contact.contactDescriptions.map(
                async (descriptionHash: SHA256Hash<ContactDescriptionTypes>) => {
                    return await getObject(descriptionHash);
                }
            )
        );
    }

    /**
     * Return the contact communication endpoints linked to the given contact object.
     *
     * @param contact - the given contact object.
     * @returns the contact communication endpoints
     */
    private async getContactCommunicationEndpoints(
        contact: Contact
    ): Promise<CommunicationEndpointTypes[]> {
        return await Promise.all(
            contact.communicationEndpoints.map(
                async (communicationEndpointHash: SHA256Hash<CommunicationEndpointTypes>) => {
                    return await getObject(communicationEndpointHash);
                }
            )
        );
    }

    /**
     * Update the content of the Contact object.
     *
     * @param personId - the given person Id
     * @param isContactDescription - flag that specifies whether the contact description needs to be updated (if true) or the contact communication points (if false)
     * @param newContactContent - the new content of the contact
     */
    private async updateContactContent(
        personId: SHA256IdHash<Person>,
        isContactDescription: boolean,
        newContactContent:
            | UnversionedObjectResult<ContactDescriptionTypes>[]
            | UnversionedObjectResult<CommunicationEndpointTypes>[]
    ): Promise<void> {
        try {
            // see if the profile does exist
            const profile = await serializeWithType('Contacts', async () => {
                return await getObjectByIdObj({$type$: 'Profile', personId: personId});
            });
            // getting the main contact
            const mainContact = await getObject(profile.obj.mainContact);
            let mainContactContentHashes;
            let mainContactContent: ContactDescriptionTypes[] | CommunicationEndpointTypes[];

            if (isContactDescription) {
                mainContactContent = await Promise.all(
                    mainContact.contactDescriptions.map(
                        async (descriptionHash: SHA256Hash<ContactDescriptionTypes>) => {
                            return await getObject(descriptionHash);
                        }
                    )
                );
                mainContactContentHashes = mainContact.contactDescriptions;
            } else {
                mainContactContent = await Promise.all(
                    mainContact.communicationEndpoints.map(
                        async (
                            communicationEndpointHash: SHA256Hash<CommunicationEndpointTypes>
                        ) => {
                            return await getObject(communicationEndpointHash);
                        }
                    )
                );
                mainContactContentHashes = mainContact.communicationEndpoints;
            }

            // removing the hash of the updated contact description from the list
            for (let i = mainContactContentHashes.length - 1; i >= 0; i--) {
                for (const newContent of newContactContent) {
                    if (newContent.obj.$type$ === mainContactContent[i].$type$) {
                        mainContactContentHashes.splice(i, 1);
                    }
                }
            }

            for (const newContent of newContactContent) {
                // @ts-ignore
                mainContactContentHashes.push(newContent.hash);
            }

            // creates the contact object
            const contactObject = await createSingleObjectThroughPurePlan(
                {module: '@one/identity'},
                {
                    $type$: 'Contact',
                    personId: personId,
                    communicationEndpoints: mainContact.communicationEndpoints,
                    contactDescriptions: mainContactContentHashes
                }
            );

            await this.updateProfile(profile, contactObject);
        } catch (e) {
            throw new Error('The profile does not exists');
        }
    }
}
