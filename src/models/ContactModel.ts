import {
    ContactApp,
    Person,
    SHA256Hash,
    SHA256IdHash,
    ProfileCRDT,
    VersionedObjectResult,
    ContactDescriptionTypes,
    UnversionedObjectResult,
    OneInstanceEndpoint,
    Keys,
    CommunicationEndpointTypes,
    Someone
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
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
import {getNthVersionMapHash} from 'one.core/lib/version-map-query';
import {OEvent} from '../misc/OEvent';

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
    PROFILE_IMAGE = 'ProfileImage',
    PERSON_STATUS = 'PersonStatus'
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
    personStatus?: string;
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

export type ProfileInfo = {
    type: string;
    value: string | ArrayBuffer;
};

/**
 *
 * @description Contact Model class
 * @augments EventEmitter
 */
export default class ContactModel extends EventEmitter {
    public onProfileUpdate = new OEvent<(profile: ProfileCRDT) => void>();
    public onNewCommunicationEndpointArrive = new OEvent<
        (communicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[]) => void
    >();

    private readonly instancesModel: InstancesModel;
    private readonly commServerUrl: string;
    private readonly boundOnVersionedObjHandler: (
        caughtObject: VersionedObjectResult
    ) => Promise<void>;

    private syncContactApp: boolean = true;

    /**
     * Create a new contact model for managing contacts.
     *
     * @param instancesModel - The model for managing local instance
     * @param commServerUrl - The comm server url for creating local contact objects
     * @param syncContactApp - If true then sync the root contact app object with your IoM. Set to
     *                         false if each instance should maintain its own list of contacts and
     *                         profiles.
     */
    constructor(
        instancesModel: InstancesModel,
        commServerUrl: string,
        syncContactApp: boolean = true
    ) {
        super();
        this.instancesModel = instancesModel;
        this.commServerUrl = commServerUrl;
        this.syncContactApp = syncContactApp;
        this.boundOnVersionedObjHandler = this.handleOnVersionedObj.bind(this);
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
        if (this.syncContactApp) {
            onVersionedObj.addListener(this.boundOnVersionedObjHandler);
        }

        // Write an access object that reflects the syncContactApp flag.
        // Note: For new applications that never shared the ContactApp object we would not need to
        // call unshare, because this only creates an unnecessary object with no access. To be on
        // the safe side for applications that are already out there we overwrite it explicitly.
        // When we redesign this model we might remove the unsharing again.
        if (this.syncContactApp) {
            await ContactModel.shareContactAppWithYourInstances();
        } else {
            await ContactModel.unshareContactAppWithYourInstances();
        }
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        if (this.syncContactApp) {
            onVersionedObj.removeListener(this.boundOnVersionedObjHandler);
        }
    }

    /** ###################### Identity management ###################### **/

    /**
     * TODO: this method will overwrite the previous profile if called twice with the same email! Should it throw
     * if identity already exists?
     *
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
                async (profileIdHash: SHA256IdHash<ProfileCRDT>) =>
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
                async (profileIdHash: SHA256IdHash<ProfileCRDT>) =>
                    (await getObjectByIdHash(profileIdHash)).obj.personId
            )
        );

        // Remove the main id if requested
        if (excludeMain) {
            identities = identities.filter(id => id !== personId);
        }

        return identities;
    }

    /** ###################### Managing contacts ###################### **/

    /**
     * Return the person id of all contacts.
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
            (profile: VersionedObjectResult<ProfileCRDT>) => profile.obj.personId
        );
    }

    /** ###################### Contact object management ###################### **/

    public async getProfile(
        personId: SHA256IdHash<Person>,
        profileName: string = 'default'
    ): Promise<ProfileCRDT> {
        const personProfile = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personId,
            profileName: profileName
        });

        // TODO why unknown type?
        return personProfile.obj as ProfileCRDT;
    }

    public async getCommunicationEndpoints(
        personId: SHA256IdHash<Person>
    ): Promise<CommunicationEndpointTypes[]> {
        const profile = await this.getProfile(personId);
        return await this.getContactCommunicationEndpoints(profile);
    }

    /**
     * Return the name of the profile identified by the person id.
     *
     * @param personId - the person id for whom the name search is performed
     * @param profileName - the profile name
     * @returns the name or an empty string if the name description wasn't found
     */
    public async getName(personId: SHA256IdHash<Person>, profileName?: string): Promise<string> {
        const profile = await this.getProfile(personId, profileName);

        let someoneName = '';

        if (profile) {
            someoneName = await this.getNameDescription(profile);
        }

        return someoneName;
    }

    public async getProfileInfos(personId: SHA256IdHash<Person>) {
        const profileInfos: ProfileInfo[] = [];
        const profile = await this.getProfile(personId);

        const descriptions = await this.getContactDescriptions(profile);
        for (const description of descriptions) {
            if (description.$type$ === DescriptionTypes.PERSON_NAME) {
                profileInfos.push({type: 'PersonName', value: description.name});
            }

            if (description.$type$ === DescriptionTypes.PROFILE_IMAGE) {
                const image = await readBlobAsArrayBuffer(description.image);
                profileInfos.push({type: 'ProfileImage', value: image});
            }

            if (description.$type$ === DescriptionTypes.PERSON_STATUS) {
                profileInfos.push({type: 'PersonStatus', value: description.status});
            }
        }

        const commEndpoints = await this.getCommunicationEndpoints(personId);
        for (const commEndpoint of commEndpoints) {
            if (commEndpoint.$type$ === CommunicationEndpointsTypes.EMAIL) {
                profileInfos.push({type: 'Email', value: commEndpoint.email});
            }
        }

        return profileInfos;
    }

    /**
     * Update the profile of a person based on the contactDescription object.
     * (e.g. if the current main contact contains just an avatar and the incoming contactDescription contains a person name
     * then the new main contact will contains both, the avatar from previous main contact and the person name from the contactDescription object.)
     *
     * @param personId - the id of the person whose main contact will be updated
     * @param contactDescription - the new values of the main contact object
     */
    public async updateDescription(
        personId: SHA256IdHash<Person>,
        profileName: string = 'default',
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
        } else if (contactDescription.personStatus) {
            // creates the personStatus object
            newContactDescriptions.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        $type$: DescriptionTypes.PERSON_STATUS,
                        status: contactDescription.personStatus
                    }
                )
            );
        }

        await this.updateContactContent(personId, true, newContactDescriptions, profileName);
    }

    /**
     * Update the profile of a person based on the communication endpoint object.
     *
     * @param personId - the given person id
     * @param profileName - the profile name
     * @param communicationEndpoint - the new communication endpoints information
     */
    public async updateCommunicationEndpoint(
        personId: SHA256IdHash<Person>,
        profileName: string = 'default',
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

        await this.updateContactContent(personId, false, newCommunicationEndpoints, profileName);
    }

    /**
     * Updated the existing profile with the new one received as parameter.
     * @param updatedProfile - The update profile.
     */
    public async updateProfile(updatedProfile: ProfileCRDT) {
        const oldProfile = await serializeWithType('Contacts', async () => {
            return await this.getProfile(updatedProfile.personId, updatedProfile.profileName);
        });
        const baseProfileHash = await calculateHashOfObj(oldProfile);
        await this.updateProfileCRDT(updatedProfile, baseProfileHash);
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

        // Get all profiles
        const allProfileObjects: ProfileCRDT[] = await Promise.all(
            allIds.map(id => this.getProfile(id))
        );

        // Get all endpoints as 1-dim array
        const allEndpointHashesNonFlat = allProfileObjects.map(cobj => cobj.communicationEndpoints);
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
    public async getSomeoneObject(personId: SHA256IdHash<Person>): Promise<Someone | undefined> {
        const contactApp = await ContactModel.getContactAppObject();
        /** get the person profile, if it doesn't exist, it means it doesn't exist in the Someone object either **/
        const personProfile = await this.getProfile(personId);

        if (personProfile === undefined) {
            return undefined;
        }

        /** get all the Someone objects in a list **/
        const someoneObjects = await Promise.all(
            contactApp.obj.contacts.map(async (someoneHash: SHA256Hash<Someone>) => {
                return await getObject(someoneHash);
            })
        );

        const idHash = await calculateIdHashOfObj(personProfile);
        /** search for the profile **/
        return someoneObjects.find((someone: Someone) => {
            return someone.profiles.find(
                (profile: SHA256IdHash<ProfileCRDT>) => profile === idHash
            );
        });
    }

    /**
     * Create a someone object for the given profile if it doesn't exist.
     * @param profile
     * @private
     */
    private async createSomeoneIfNotExists(profile: VersionedObjectResult<ProfileCRDT>) {
        const contactApp = await ContactModel.getContactAppObject();
        const someoneObject = await this.getSomeoneObject(profile.obj.personId);

        if (someoneObject === undefined) {
            /** create a new someone object **/
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
        }
    }
    // TODO A single profile per person in V0.0.1
    /**
     * Register the given profile to my someoneObject and update contactApp.
     * HOOK function: Serialized since it's part of an object listener or not.
     *
     * @param profile - the given profile
     */
    private async registerNewSelfProfile(
        profile: VersionedObjectResult<ProfileCRDT>
    ): Promise<void> {
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
    ): Promise<VersionedObjectResult<ProfileCRDT>> {
        // Create a profile for myself
        if (forMyself) {
            return await serializeWithType('Contacts', async () => {
                // Create the local instance including the instance keys
                const createdInstance = await this.instancesModel.createLocalInstanceByEMail(
                    personEmail
                );

                // Create relevant profile objects
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createOwnProfileCRDT'},
                    personEmail,
                    'default',
                    createdInstance,
                    this.commServerUrl,
                    takeOver
                )) as VersionedObjectResult<ProfileCRDT>;

                //Add the profile to the someone object
                await this.registerNewSelfProfile(profile);

                this.onNewCommunicationEndpointArrive.emit(profile.obj.communicationEndpoints);
                this.emit(
                    ContactEvent.NewCommunicationEndpointArrived,
                    profile.obj.communicationEndpoints
                );
                return profile;
            });
        } else {
            // Create a profile for others
            return await serializeWithType('Contacts', async () => {
                // Just create the person id and the relevant profile objects
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createOthersProfileCRDT'},
                    personEmail,
                    'default'
                )) as VersionedObjectResult<ProfileCRDT>;

                // Add the profile to the someone object (or create a new one)
                await this.createSomeoneObjectIfNotExists(profile);
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
            // TODO ContactApp might be shared for IoM, but not for version V0.0.1
            // // Get the profiles of myself
            // const updatedSomeoneObjectForMyself = await getObject(caughtObject.obj.me);
            // // const myPersonId = await getObjectByIdHash(caughtObject.obj.me);
            // const profile = await this.getProfile(caughtObject.obj.me, '', caughtObject.obj.me);
            // const profiles = await Promise.all(
            //     updatedSomeoneObjectForMyself.profiles.map(
            //         async (profileIdHash: SHA256IdHash<ProfileCRDT>) => {
            //             return await getObjectByIdHash(profileIdHash);
            //         }
            //     )
            // );
            //
            // //Iterate over profiles and check which profile does not have a local instance -> generate them
            // await Promise.all(
            //     profiles.map(async (profile: VersionedObjectResult<ProfileCRDT>) => {
            //         if (await this.instancesModel.hasPersonLocalInstance(profile.obj.personId)) {
            //             return;
            //         }
            //
            //         // Create profile for this
            //         const personEmail = (await getObjectByIdHash(profile.obj.personId)).obj.email;
            //         await this.serializeProfileCreatingByPersonEmail(personEmail, true);
            //     })
            // );
            //
            // //generate local instance if the profile doesn't have one
            // if (!(await this.instancesModel.hasPersonLocalInstance(profile.personId))) {
            //     const personEmail = (await getObjectByIdHash(profile.personId)).obj.email;
            //     await this.serializeProfileCreatingByPersonEmail(personEmail, true);
            // }
            //
            // await serializeWithType('ContactApp', async () => {
            //     try {
            //         const firstPreviousContactObjectHash = await getNthVersionMapHash(
            //             caughtObject.idHash,
            //             -1
            //         );
            //         if (firstPreviousContactObjectHash !== caughtObject.hash) {
            //             await createSingleObjectThroughImpurePlan(
            //                 {module: '@module/mergeContactApp'},
            //                 caughtObject.idHash
            //             );
            //         }
            //     } catch (_) {
            //         return;
            //     }
            // });
            //
            // this.emit(ContactEvent.UpdatedContactApp);
            // this.onContactAppUpdate.emit();
        }
        if (ContactModel.isProfileCRDTVersionedObjectResult(caughtObject)) {
            await serializeWithType('Contacts', async () => {
                await this.createSomeoneIfNotExists(caughtObject);
                try {
                    const firstPreviousProfileObjectHash = await getNthVersionMapHash(
                        caughtObject.idHash,
                        -2
                    );

                    if (firstPreviousProfileObjectHash !== caughtObject.hash) {
                        this.onProfileUpdate.emit(caughtObject.obj);
                        this.emitNewCommunicationEndpointsEventIfCase(
                            firstPreviousProfileObjectHash,
                            caughtObject.obj
                        );
                    }
                } catch (_) {
                    // catch reached when there isn't a previous version
                    this.onNewCommunicationEndpointArrive.emit(
                        caughtObject.obj.communicationEndpoints
                    );

                    return;
                }
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
    private static isProfileCRDTVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<ProfileCRDT> {
        return (caughtObject as VersionedObjectResult<ProfileCRDT>).obj.$type$ === 'ProfileCRDT';
    }

    /**
     * Private utility function which creates a someone object and updates the contact app,  if the someone
     * object doesn't exist.
     *
     * @param profile - the given profile
     */
    private async createSomeoneObjectIfNotExists(
        profile: VersionedObjectResult<ProfileCRDT>
    ): Promise<void> {
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
        await createSingleObjectThroughImpurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {
                    '*': VERSION_UPDATES.NONE_IF_LATEST
                }
            },
            [setAccessParam]
        );
    }

    /**
     * Revoke a previous sharing of the contact app object.
     *
     * This does not have to be called when the instance never shared the ContactApp object before.
     */
    private static async unshareContactAppWithYourInstances(): Promise<void> {
        const contactAppVersionedObjectResult = await ContactModel.getContactAppObject();

        const setAccessParam: SetAccessParam = {
            group: [],
            id: contactAppVersionedObjectResult.idHash,
            mode: SET_ACCESS_MODE.REPLACE,
            person: []
        };
        await createSingleObjectThroughImpurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {
                    '*': VERSION_UPDATES.NONE_IF_LATEST
                }
            },
            [setAccessParam]
        );
    }

    /**
     * Update the Profile object with a new Contact object.
     *
     * @param  profile - the given profile object
     * @param baseProfileHash - the base profile object hash
     */
    private async updateProfileCRDT(
        profile: ProfileCRDT,
        baseProfileHash: SHA256Hash<ProfileCRDT>
        // contactObject: UnversionedObjectResult<Contact>
    ): Promise<void> {
        /** update the profile **/
        await serializeWithType('Contacts', async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@module/mergeProfileCRDT',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                profile,
                baseProfileHash
            );
        });

        this.emit(ContactEvent.UpdatedProfile, profile);
        this.onProfileUpdate.emit(profile);
        // TODO needed? Emit the other events?

        // const existingContact = profile.obj.contactObjects.find(
        //     (contactHash: SHA256Hash<Contact>) => contactHash === contactObject!.hash
        // );
        // if (existingContact === undefined) {
        //     profile.obj.contactObjects.push(contactObject.hash);
        // }
        //
        // profile.obj.mainContact = contactObject.hash;

        //  this.emit(ContactEvent.NewContact, contactObject);
        // this.onContactNew.emit(contactObject);

        //  if (existingContact === undefined) {
        //      this.emit(
        //          ContactEvent.NewCommunicationEndpointArrived,
        //          contactObject.obj.communicationEndpoints
        //      );
        //      this.onNewCommunicationEndpointArrive.emit(contactObject.obj.communicationEndpoints);
        //  }
    }

    /**
     * Return the person name description from a profile object.
     * If there is no name in the given profile object as a parameter, it will return an empty string.
     *
     * @param profile - the given profile object
     * @returns the name that was found or empty string
     */
    private async getNameDescription(profile: ProfileCRDT): Promise<string> {
        // get the descriptions of profile object
        const contactDescriptions = await this.getContactDescriptions(profile);

        // iterate over the contact descriptions and search for name
        for (const description of contactDescriptions) {
            if (description.$type$ === DescriptionTypes.PERSON_NAME) {
                return description.name;
            }
        }

        return '';
    }

    /**
     * Return the contact descriptions linked to the given profile object.
     *
     * @param profile - the given profile object.
     * @returns the contact description
     */
    private async getContactDescriptions(profile: ProfileCRDT): Promise<ContactDescriptionTypes[]> {
        return await Promise.all(
            profile.contactDescriptions.map(
                async (descriptionHash: SHA256Hash<ContactDescriptionTypes>) => {
                    return await getObject(descriptionHash);
                }
            )
        );
    }

    /**
     * Return the contact communication endpoints linked to the given profile object.
     *
     * @param profile - the given profile object.
     * @returns the contact communication endpoints
     */
    private async getContactCommunicationEndpoints(
        profile: ProfileCRDT
    ): Promise<CommunicationEndpointTypes[]> {
        return await Promise.all(
            profile.communicationEndpoints.map(
                async (communicationEndpointHash: SHA256Hash<CommunicationEndpointTypes>) => {
                    return await getObject(communicationEndpointHash);
                }
            )
        );
    }

    /**
     * Update the content of the Profile object.
     *
     * @param personId - the given person Id
     * @param isContactDescription - flag that specifies whether the contact description needs to be updated (if true) or the contact communication points (if false)
     * @param newProfileContent - the new content of the profile
     */
    private async updateContactContent(
        personId: SHA256IdHash<Person>,
        isContactDescription: boolean,
        newProfileContent:
            | UnversionedObjectResult<ContactDescriptionTypes>[]
            | UnversionedObjectResult<CommunicationEndpointTypes>[],
        profileName?: string
    ): Promise<void> {
        try {
            // see if the profile does exist
            const profile = await serializeWithType('Contacts', async () => {
                return await this.getProfile(personId, profileName);
            });
            const baseProfileHash = await calculateHashOfObj(profile);
            let profileContentHashes;
            let profileContent: ContactDescriptionTypes[] | CommunicationEndpointTypes[];

            if (isContactDescription) {
                profileContent = await Promise.all(
                    profile.contactDescriptions.map(
                        async (descriptionHash: SHA256Hash<ContactDescriptionTypes>) => {
                            return await getObject(descriptionHash);
                        }
                    )
                );
                profileContentHashes = profile.contactDescriptions;
            } else {
                profileContent = await Promise.all(
                    profile.communicationEndpoints.map(
                        async (
                            communicationEndpointHash: SHA256Hash<CommunicationEndpointTypes>
                        ) => {
                            return await getObject(communicationEndpointHash);
                        }
                    )
                );
                profileContentHashes = profile.communicationEndpoints;
            }

            // removing the hash of the updated contact description from the list
            for (let i = profileContentHashes.length - 1; i >= 0; i--) {
                for (const newContent of newProfileContent) {
                    if (newContent.obj.$type$ === profileContent[i].$type$) {
                        profileContentHashes.splice(i, 1);
                    }
                }
            }

            for (const newContent of newProfileContent) {
                // @ts-ignore
                profileContentHashes.push(newContent.hash);
            }

            await this.updateProfileCRDT(profile, baseProfileHash);
        } catch (e) {
            throw new Error('The profile does not exists');
        }
    }

    /**
     * Emits onNewCommunicationEndpoints event if the new profile version contains new
     * communication endpoints.
     * @param previousProfileObjectHash - Hash of the previous profile version.
     * @param newProfile - The new profile object.
     * @private
     */
    private async emitNewCommunicationEndpointsEventIfCase(
        previousProfileObjectHash: SHA256Hash<ProfileCRDT>,
        newProfile: ProfileCRDT
    ): Promise<void> {
        const previousProfile = await getObject(previousProfileObjectHash);
        const newCommunicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[] = [];

        if (
            previousProfile.communicationEndpoints.length ===
            newProfile.communicationEndpoints.length
        ) {
            return;
        }

        newProfile.communicationEndpoints.forEach(endpoint => {
            if (!previousProfile.communicationEndpoints.includes(endpoint)) {
                newCommunicationEndpoints.push(endpoint);
            }
        });

        if (newCommunicationEndpoints.length > 0) {
            this.onNewCommunicationEndpointArrive.emit(newCommunicationEndpoints);
        }
    }
}
