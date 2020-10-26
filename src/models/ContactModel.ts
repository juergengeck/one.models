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
    CommunicationEndpointTypes,
    OneInstanceEndpoint,
    Keys,
    BLOB
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
    WriteStorageApi
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
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';

/**
 * This represents a ContactEvent
 * @enum UpdatedContactList -> this event retrieves ContactApp.obj.contacts ( a list of SHA256Hash<Someones> )
 *       UpdatedContact -> this event retrieves the updated Profile object ( an object of type VersionedObjectResult<Profile> )
 */
export enum ContactEvent {
    UpdatedContactList = 'UPDATED_CONTACT_LIST',
    UpdatedContact = 'UPDATED_CONTACT',
    NewCommunicationEndpointArrived = 'NEW_ENDPOINT_ARRIVED',
    UpdatedContactApp = 'UPDATED_CONTACT_APP'
}

/**
 * This represents the current contact description fields that can be provided by the user.
 */
export type ContactDescription = {
    personName?: string;
    image?: ArrayBuffer;
};

/**
 * Saving the profile image in ONE as a BLOB and returning the reference for it.
 *
 * @param {ArrayBuffer} profileImage - the image that is saved in ONE as a BLOB.
 * @returns {Promise<SHA256Hash<BLOB>>} The reference to the saved BLOB.
 */
async function saveProfileImageAsBLOB(profileImage: ArrayBuffer): Promise<SHA256Hash<BLOB>> {
    const minimalWriteStorageApiObj = {
        createFileWriteStream: createFileWriteStream
    } as WriteStorageApi;

    const stream = minimalWriteStorageApiObj.createFileWriteStream();
    stream.write(profileImage);

    const blob = await stream.end();

    return blob.hash;
}

/**
 *
 * @description Contact Model class
 * @augments EventEmitter
 */
export default class ContactModel extends EventEmitter {
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
     * !!! Any action on the contactApp object must be serialized
     */
    public static async getContactAppObject(): Promise<VersionedObjectResult<ContactApp>> {
        return await serializeWithType('ContactApp', async () => {
            return await getObjectByIdObj({$type$: 'ContactApp', appId: 'ContactApp'});
        });
    }

    /**
     * @description
     * Initialize the structure. This has to be called after the one instance is initialized.
     * @returns {Promise<void>}
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

        await this.shareContactAppWithYourInstances();
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        onVersionedObj.removeListener(this.boundOnVersionedObjHandler);
        onUnversionedObj.removeListener(this.boundOnUnVersionedObjHandler);
    }

    /**
     * @description Create a new personId and an associated profile.
     * @param {boolean} myself
     * @param {SHA256IdHash<Person>} email
     * @returns {Promise<SHA256IdHash<Person>>}
     */
    public async createProfile(
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
     * Get my main identity
     *
     * @returns {Promise<SHA256IdHash<Person>>}
     */
    public async myMainIdentity(): Promise<SHA256IdHash<Person>> {
        const contactApp = await ContactModel.getContactAppObject();
        const mySomeoneObject = await getObject(contactApp.obj.me);
        return (await getObjectByIdHash(mySomeoneObject.mainProfile)).obj.personId;
    }

    /**
     * @description Get own profile identities
     * This returns the person id hashes for all profiles gathered in my
     * own someone object.
     * @returns {Promise<SHA256IdHash<Person>[]>}
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
     * @description returns the persons id of every contact main profile
     * @returns {Promise<SHA256IdHash<Person>[]>}
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

    /**
     * @description Retrieve the Someone object for a given personId
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Someone | undefined>}
     */
    public async getSomeoneObject(personId: SHA256IdHash<Person>): Promise<Someone | undefined> {
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
     * @description This returns the person id hashes for all profiles gathered in my
     * own someone object.
     * @param {SHA256IdHash<Person>} personId - The person id for which to search for alternate ids.
     * @param excludeMain
     * @returns {Promise<SHA256IdHash<Person>[]> | Promise<undefined>}
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
     * @description Get the main
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Contact>}
     */
    public async getMainContactObject(personId: SHA256IdHash<Person>): Promise<Contact> {
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        return await getObject(personProfile.obj.mainContact);
    }

    /**
     * @description Get a list of Contact Objects by a given personId
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Contact[]>}
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
     * @description Get a list of Contact Objects by a given personId
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Contact[]>}
     */
    public async getContactIdObjects(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256Hash<Contact>[]> {
        const personProfile = await getObjectByIdObj({$type$: 'Profile', personId: personId});
        return personProfile.obj.contactObjects;
    }

    /**
     * @description Merges contact objects
     * e.g for descriptions -> [{type: 'Name', personName: 'name'}, {type: 'Image', personImage: 'someBLOB'}]
     * will be converted into {personName: 'Name', personImage: 'someBLOB'}
     * @param {SHA256IdHash<Person>} personId
     *
     * { description: DescriptionEndpointType ; metadata: {
     *     source: SHA256IdHash<Person>[];
     *     fromMainContactObject: boolean;
     * }}[]
     * @returns {Promise<{endpoints: {}; descriptions: {}; meta: {}}>}
     */
    public async getMergedContactObjects(
        personId: SHA256IdHash<Person>
    ): Promise<{endpoints: {}; descriptions: {}; meta: {}}> {
        const contacts = await this.getContactObjects(personId);
        const {
            endpoints,
            descriptions
        } = await this.getFlattenedEndpointsAndDescriptionsFromContacts(contacts);

        const mergedDescriptions = Object.assign({}, ...descriptions);
        const mergedEndpoints = Object.assign({}, ...endpoints);
        delete mergedDescriptions.type;
        delete mergedEndpoints.type;
        return {endpoints: mergedEndpoints, descriptions: mergedDescriptions, meta: {}};
    }

    /**
     * This function updates the main contact of a person based on the contactDescription object.
     * (e.g. if the current main contact contains just an avatar and the incoming contactDescription contains a person name
     * then the new main contact will contains both, the avatar from previous main contact and the person name from the contactDescription object.)
     *
     * @TODO - update the function to support also the communication endpoints.
     *
     * @param {SHA256IdHash<Person>} personId - the id of the person whose main contact will be updated.
     * @param {ContactDescription} contactDescription - the new values of the main contact object.
     * @returns {Promise<void>}
     */
    public async updateDescription(
        personId: SHA256IdHash<Person>,
        contactDescription: ContactDescription
    ): Promise<void> {
        let personName: UnversionedObjectResult<ContactDescriptionTypes> | null = null;
        let profileImage: UnversionedObjectResult<ContactDescriptionTypes> | null = null;

        // creates the personName object
        if (contactDescription.personName) {
            personName = await createSingleObjectThroughPurePlan(
                {module: '@one/identity'},
                {$type$: 'PersonName', name: contactDescription.personName}
            );
        }

        // creates the profileImage object
        if (contactDescription.image) {
            // Create the reference to the profile image
            const profileImageReference = await saveProfileImageAsBLOB(contactDescription.image);

            const oneProfileImage = {
                $type$: 'ProfileImage',
                image: profileImageReference
            };

            profileImage = await createSingleObjectThroughPurePlan(
                {module: '@one/identity'},
                oneProfileImage
            );
        }

        try {
            /** see if the profile does exist **/
            const profile = await serializeWithType('Contacts', async () => {
                return await getObjectByIdObj({$type$: 'Profile', personId: personId});
            });

            // getting the main contact
            const mainContact = await getObject(profile.obj.mainContact);

            const mainContactDescriptions: ContactDescriptionTypes[] = [];
            const mainContactDescriptionHashes = mainContact.contactDescriptions;

            // getting the current contact descriptions
            for (const description of mainContact.contactDescriptions) {
                mainContactDescriptions.push(await getObject(description));
            }

            let contactObject: UnversionedObjectResult<Contact> | null = null;

            // removing the hash of the updated contact description from the list
            for (let i = mainContactDescriptionHashes.length - 1; i >= 0; i--) {
                if (personName && personName.obj.$type$ === mainContactDescriptions[i].$type$) {
                    mainContactDescriptionHashes.splice(i, 1);
                }

                if (profileImage && profileImage.obj.$type$ === mainContactDescriptions[i].$type$) {
                    mainContactDescriptionHashes.splice(i, 1);
                }
            }

            if (personName) {
                mainContactDescriptionHashes.push(personName.hash);
            }

            if (profileImage) {
                mainContactDescriptionHashes.push(profileImage.hash);
            }

            // creates the contact object
            contactObject = await createSingleObjectThroughPurePlan(
                {module: '@one/identity'},
                {
                    $type$: 'Contact',
                    personId: personId,
                    communicationEndpoints: [],
                    contactDescriptions: mainContactDescriptionHashes
                }
            );

            if (contactObject !== null) {
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

                this.emit(ContactEvent.UpdatedContact, profile);
                if (existingContact === undefined) {
                    this.emit(
                        ContactEvent.NewCommunicationEndpointArrived,
                        contactObject.obj.communicationEndpoints
                    );
                }
            }
        } catch (e) {
            throw new Error('The profile does not exists');
        }
    }

    /**
     * HOOK function
     * @description Serialized since it's part of an object listener or not
     * @param {VersionedObjectResult<Profile>} profile
     * @returns {Promise<void>}
     */
    public async registerNewSelfProfile(profile: VersionedObjectResult<Profile>): Promise<void> {
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
     * @todo pure plan next weeks
     * @description Refuse merging if one of the person ids belongs to a secondary profile
     * @param {SHA256IdHash<Person>} personA - This profile will always became the main profile
     * @param {SHA256IdHash<Person>} personB - This person will always become a secondary profile
     * @returns {Promise<void>}
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

    /**
     * Find instance endpoints objects for contacts / or for me.
     *
     * @param {boolean} forMe - If true then all endpoints for myself, if false then all endpoints of contacts.
     * @param {boolean} onlyMain - If forMe is true then this selects between all my ids, or just my main id.
     * @returns {Promise<OneInstanceEndpoint[]>}
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

        // Get all OneInstanceEndpoints
        const oneInstanceEndpoints = allEndpoints.filter(
            endp => endp.$type$ === 'OneInstanceEndpoint'
        );
        return oneInstanceEndpoints;
    }

    /**
     * Get the person keys for a specific person.
     *
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Keys>}
     */
    public async personKeysForPerson(personId: SHA256IdHash<Person>): Promise<Keys> {
        const personKeyLink = await getAllValues(personId, true, 'Keys');
        return await getObjectWithType(personKeyLink[personKeyLink.length - 1].toHash, 'Keys');
    }

    /** ########################################## Private ########################################## **/

    /**
     * @description Serialized profile creation wrapper
     * @param {string} personEmail
     * @param {boolean} forMyself
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
     * @description Checks if the contactApp was created for this particular instance
     * @returns {Promise<boolean>}
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
     * @param {VersionedObjectResult} caughtObject
     * @return {Promise<void>}
     */
    private async handleOnVersionedObj(caughtObject: VersionedObjectResult): Promise<void> {
        if (this.isContactAppVersionedObjectResult(caughtObject)) {
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

            /*await serializeWithType('ContactApp', async () => {
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
                });*/

            this.emit(ContactEvent.UpdatedContactApp);
        }
        if (this.isProfileVersionedObjectResult(caughtObject)) {
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
     * @param {UnversionedObjectResult} caughtObject
     * @return {Promise<void>}
     */
    private async handleOnUnVersionedObj(caughtObject: UnversionedObjectResult): Promise<void> {
        if (this.isContactUnVersionedObjectResult(caughtObject)) {
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
                this.emit(
                    ContactEvent.NewCommunicationEndpointArrived,
                    caughtObject.obj.communicationEndpoints
                );

                // Do not write a new profile version if this contact object is already part of it
                // This also might happen when a new profile object ist synchronized with a new contact
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
     * @description type check
     * @param {VersionedObjectResult} caughtObject
     * @returns {VersionedObjectResult<ContactApp>}
     */
    private isContactAppVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<ContactApp> {
        return (caughtObject as VersionedObjectResult<ContactApp>).obj.$type$ === 'ContactApp';
    }

    /**
     * @description type check
     * @param {VersionedObjectResult} caughtObject
     * @returns {VersionedObjectResult<Profile>}
     */
    private isProfileVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<Profile> {
        return (caughtObject as VersionedObjectResult<Profile>).obj.$type$ === 'Profile';
    }

    /**
     * @description type check
     * @param {UnversionedObjectResult} caughtObject
     * @returns {UnversionedObjectResult<Contact>}
     */
    private isContactUnVersionedObjectResult(
        caughtObject: UnversionedObjectResult
    ): caughtObject is UnversionedObjectResult<Contact> {
        return (caughtObject as UnversionedObjectResult<Contact>).obj.$type$ === 'Contact';
    }
    /**
     * @description Private utility function to register another person profile.
     * @param {Profile} profile
     * @returns {Promise<void>}
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
        }
    }

    private async shareContactAppWithYourInstances() {
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
     * @description Returns the flattened & exploded descriptions/endpoints
     * @param {Contact[]} contacts
     * @returns {Promise<{endpoints: CommunicationEndpoint[]; descriptions: ContactDescription[]}>}
     */
    private async getFlattenedEndpointsAndDescriptionsFromContacts(
        contacts: Contact[]
    ): Promise<{endpoints: CommunicationEndpointTypes[]; descriptions: ContactDescriptionTypes[]}> {
        const endpoints = (
            await Promise.all(
                contacts.map(
                    async (contact: Contact) =>
                        await Promise.all(
                            contact.communicationEndpoints.map(
                                async (communicationHash: SHA256Hash<CommunicationEndpointTypes>) =>
                                    await getObject(communicationHash)
                            )
                        )
                )
            )
        ).reduce((acc, val) => acc.concat(val), []);
        const descriptions = (
            await Promise.all(
                contacts.map(
                    async (contact: Contact) =>
                        await Promise.all(
                            contact.contactDescriptions.map(
                                async (descriptionHash: SHA256Hash<ContactDescriptionTypes>) =>
                                    await getObject(descriptionHash)
                            )
                        )
                )
            )
        ).reduce((acc, val) => acc.concat(val), []);
        return {endpoints, descriptions};
    }
}
