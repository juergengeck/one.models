import {
    Person,
    SHA256Hash,
    SHA256IdHash,
    VersionedObjectResult,
    UnversionedObjectResult,
    Keys
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
 * This class manages people - to be precise: their identities including your own.
 *
 * Identity is important for defining which data belongs to whom, with whom to share data ...
 * This class is one of the few central building blocks that makes the one ecosystem tick.
 *
 * It uses three concepts to manage identities:
 * - Person:  A person is the identity used throughout the application. Connections, messages
 *            access rights are all tied to a person. The SHA256Hash of the person object is
 *            what is usually used to refer to a person, so if we speak of person-id we usually mean
 *            the SHA256Hash<Person>. Another alias for a person / person-id is 'Identity'.
 * - Profile: A profile describes a person and ways how to contact that person.
 *            Multiple profiles for the same person are supported, because we think that you don't
 *            want to share the same profile about yourself with all persons you know. Perhaps you
 *            want to share a 'good boy' profile (nice profile image) with your family, but a
 *            bad-ass profile with your friends.
 * - Someone: A real life persons might want to create multiple identities. Use cases are:
 *            - Anonymous identities (throw away identities or for dating ...)
 *            - Work Identity / Private Identity to be able to separate work from private life
 *              better compared having one identity but a work and private profile.
 *            'Someone' is a collection of Identities that belongs to a single person. For other
 *            persons you usually only know a single identity, so the someone object of this person
 *            just refers to profiles of a single identity. But for your own you will have lots of
 *            Identities. Someone is only a local mechanism to group multiple identities of the
 *            same person. It has no meaning beyond the own ONE ecosystem.
 *
 * Q: How are Person / Profile and Someone related?
 * A: Someone refers to multiple profiles, a profile refers to an identity.
 *
 * Q: What are the responsibilities of this model?
 * A:
 * 1) Manage all those identities
 *    - Create new identities
 *    - Get a list of identities / own identities
 * 2) Manage the profiles describe those identities.
 *    - create / update / delete profiles
 *    - share profiles with others / get sharing state
 *    - obtain profiles
 */
export default class PeopleModel extends EventEmitter {
    //public onProfileUpdate = new OEvent<(profile: ProfileCRDT) => void>();

    /*public onNewCommunicationEndpointArrive = new OEvent<
        (communicationEndpoints: SHA256Hash<CommunicationEndpointTypes>[]) => void
    >();*/

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
            // const contactObjectIdHash = await calculateIdHashOfObj({
            //     $type$: 'ContactApp',
            //     appId: 'ContactApp'
            // });
            // TODO: The merging plan must be replaced by making ContactApp object a CRDT.
            // await createSingleObjectThroughImpurePlan(
            //     {module: '@module/mergeContactApp'},
            //     contactObjectIdHash
            // );
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
     * Create a new personId and an associated profile. A new someone object will be created if it doesn't exist.
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

        // Set generated email as initial email communication endpoint
        const profileData: ProfileData = {
            profileHash: createdProfile.hash,
            communicationEndpoint: {emails: [personEmail]},
            description: {}
        };
        await this.updateProfile(profileData, createdProfile.obj.personId);

        return createdProfile.obj.personId;
    }

    /**
     * Create a new anonymous identity and a profile for a someone object.
     * @param forMyself - if the new profile is for myself.
     * @param personId - the person id to identify the someone object to which the profile is added.
     * @param profileData - the profile infos for the new profile.
     */
    public async createNewIdentityForSomeone(
        forMyself: boolean,
        personId?: SHA256IdHash<Person>,
        profileData?: ProfileData
    ): Promise<SHA256IdHash<Person>> {
        const personEmail = await createRandomString(20);

        const createdProfile = await this.createProfileForSomeone(personEmail, forMyself, personId);

        // If profile data is not provided, set the email address as the generated random one
        if (profileData === undefined) {
            profileData = {
                description: {},
                communicationEndpoint: {emails: [personEmail]},
                profileHash: createdProfile.hash
            };
        }

        // If email is not provided, set it as the generated random one
        if (profileData.communicationEndpoint.emails.length == 0) {
            profileData.communicationEndpoint.emails = [personEmail];
        }

        profileData.profileHash = createdProfile.hash;

        await this.updateProfile(
            profileData,
            createdProfile.obj.personId,
            createdProfile.obj.profileName
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
     * Return the person id of the main profile of all someone objects.
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

        return personProfile.obj;
    }

    /**
     * Fetch list of communication endpoints for given personId.
     * @param personId
     */
    public async getCommunicationEndpoints(
        personId: SHA256IdHash<Person>
    ): Promise<CommunicationEndpointTypes[]> {
        const profile = await this.getProfile(personId);

        return await Promise.all(
            profile.communicationEndpoints.map(
                async (communicationEndpointHash: SHA256Hash<CommunicationEndpointTypes>) => {
                    return await getObject(communicationEndpointHash);
                }
            )
        );
    }

    /**
     * Return the person name description from a profile object identified by the person id. If there is no name in the
     * given profile object as a parameter, it will return an empty string.
     *
     * @param personId - the person id for whom the name search is performed
     * @param profileName - the profile name
     * @returns the name or an empty string if the name description wasn't found
     */
    public async getName(
        personId: SHA256IdHash<Person>,
        profileName: string = 'default'
    ): Promise<string> {
        const profile = await this.getProfile(personId, profileName);

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
     * Fetches all the informations of the profile identified by personId and profileName.
     * @param personId
     * @param profileName
     */
    public async getProfileInfos(
        personId: SHA256IdHash<Person>,
        profileName: string = 'default'
    ): Promise<ProfileInfo> {
        const profile = await this.getProfile(personId, profileName);
        const profileHash = await calculateHashOfObj(profile);

        const profileInfo = {profileProps: [], profileHash: profileHash} as ProfileInfo;

        const descriptions = await this.getContactDescriptions(profile);
        for (const description of descriptions) {
            switch (description.$type$) {
                case DescriptionTypes.PERSON_NAME: {
                    profileInfo.profileProps.push({
                        type: DescriptionTypes.PERSON_NAME,
                        value: description.name
                    });
                    break;
                }
                case DescriptionTypes.PROFILE_IMAGE: {
                    const image = await readBlobAsArrayBuffer(description.image);
                    profileInfo.profileProps.push({
                        type: DescriptionTypes.PROFILE_IMAGE,
                        value: image
                    });
                    break;
                }
                case DescriptionTypes.PERSON_STATUS: {
                    profileInfo.profileProps.push({
                        type: DescriptionTypes.PERSON_STATUS,
                        value: description.status
                    });
                    break;
                }
            }
        }

        const commEndpoints = await this.getCommunicationEndpoints(personId);
        for (const commEndpoint of commEndpoints) {
            if (commEndpoint.$type$ === CommunicationEndpointsTypes.EMAIL) {
                profileInfo.profileProps.push({
                    type: CommunicationEndpointsTypes.EMAIL,
                    value: commEndpoint.email
                });
            }
        }

        return profileInfo;
    }

    /**
     * Update profile with the new profile data received as a parameter.
     * NOTE: All the profile data will be overwritten. Missing values in the profile
     * data parameter will set the updated profile properties to undefined.
     * @param newProfileData - the new profile data.
     * @param personId - the person id hash.
     * @param profileName - the profile name.
     */
    public async updateProfile(
        newProfileData: ProfileData,
        personId: SHA256IdHash<Person>,
        profileName: string = 'default'
    ): Promise<void> {
        let profile;
        try {
            profile = await this.getProfile(personId, profileName);
        } catch (e) {
            throw new Error('The profile does not exist');
        }

        if (newProfileData.profileHash === undefined) {
            throw new Error('Profile hash is undefined');
        }

        /** update communication endpoint **/
        let newCommunicationEndpoints: UnversionedObjectResult<CommunicationEndpointTypes>[] = [];

        for (const email of newProfileData.communicationEndpoint.emails) {
            // creates the email object
            newCommunicationEndpoints.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        $type$: CommunicationEndpointsTypes.EMAIL,
                        email: email
                    }
                )
            );
        }

        const hashes = newCommunicationEndpoints.map(
            (commEndpoint: UnversionedObjectResult<CommunicationEndpointTypes>) => {
                return commEndpoint.hash;
            }
        );

        profile.communicationEndpoints = hashes;

        /** update description **/
        let newContactDescriptions: UnversionedObjectResult<ContactDescriptionTypes>[] = [];

        if (newProfileData.description.personName !== undefined) {
            // creates the personName object
            newContactDescriptions.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        $type$: DescriptionTypes.PERSON_NAME,
                        name: newProfileData.description.personName
                    }
                )
            );
        }

        if (newProfileData.description.image !== undefined) {
            // creates the profileImage object
            newContactDescriptions.push(
                await createSingleObjectThroughImpurePlan(
                    {
                        module: '@module/createProfilePicture',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    newProfileData.description.image
                )
            );
        }

        if (newProfileData.description.personStatus !== undefined) {
            // creates the personStatus object
            newContactDescriptions.push(
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        $type$: DescriptionTypes.PERSON_STATUS,
                        status: newProfileData.description.personStatus
                    }
                )
            );
        }

        const descriptionHashes = newContactDescriptions.map(
            (description: UnversionedObjectResult<ContactDescriptionTypes>) => {
                return description.hash;
            }
        );

        profile.contactDescriptions = descriptionHashes;

        /** update profile **/
        await this.mergeProfile(profile, newProfileData.profileHash);
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

        /** include my someone object **/
        someoneObjects.push(await getObject(contactApp.obj.me));

        const idHash = await calculateIdHashOfObj(personProfile);
        /** search for the profile **/
        return someoneObjects.find((someone: Someone) => {
            return someone.profiles.find(
                (profile: SHA256IdHash<ProfileCRDT>) => profile === idHash
            );
        });
    }

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
        /** Create a profile for myself **/
        if (forMyself) {
            return this.createProfileForMyself(personEmail);
        }

        /** Create a profile for others **/
        return await serializeWithType('Contacts', async () => {
            // Just create the person id and the relevant profile objects
            const profile = (await createSingleObjectThroughPurePlan(
                {module: '@module/createOthersProfileCRDT'},
                personEmail,
                'default'
            )) as VersionedObjectResult<ProfileCRDT>;

            await this.createSomeoneObjectIfNotExists(profile);
            return profile;
        });
    }

    /**
     * Serialize profile creation wrapper for new profiles for same someone object.
     * @param personEmail - the person email address.
     * @param forMyself - flag specifies if the profile is for my someone object or for others.
     * @param personId - the personId used to identify the someone object for which the profile is created. It is
     * not needed if the profile is created for myself.
     * @private
     */
    private async createProfileForSomeone(
        personEmail: string,
        forMyself: boolean,
        personId?: SHA256IdHash<Person>
    ): Promise<VersionedObjectResult<ProfileCRDT>> {
        /** Create a profile for myself **/
        if (forMyself) {
            return this.createProfileForMyself(personEmail);
        }

        /** Create a profile for others **/
        if (personId === undefined) {
            throw new Error('personId must be defined to create a new profile');
        }

        return await serializeWithType('Contacts', async () => {
            /** Create new profile **/
            const profile = (await createSingleObjectThroughPurePlan(
                {module: '@module/createOthersProfileCRDT'},
                personEmail,
                'default'
            )) as VersionedObjectResult<ProfileCRDT>;

            const contactApp = await ContactModel.getContactAppObject();
            const someoneObject = await this.getSomeoneObject(personId);

            if (someoneObject === undefined) {
                throw new Error('Someone object not found for the given personId');
            }

            /** calculate the hash of the old someone to be removed **/
            const someoneObjectHash = await calculateHashOfObj(someoneObject);

            /** adding the new profile to someone object's profiles **/
            someoneObject.profiles.push(profile.idHash);

            /** saving the someone object updates **/
            const updatedSomeone = await serializeWithType(
                await calculateHashOfObj(someoneObject),
                async () => {
                    return await createSingleObjectThroughPurePlan(
                        {
                            module: '@one/identity',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        someoneObject
                    );
                }
            );

            /** update the contact app object to the new someone **/
            contactApp.obj.contacts.forEach((item, index) => {
                if (item === someoneObjectHash) {
                    contactApp.obj.contacts.splice(index, 1);
                    contactApp.obj.contacts.push(updatedSomeone.hash);
                }
            });

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

            return profile;
        });
    }

    /**
     * Create a profile for myself.
     * @param personEmail
     * @param takeOver
     * @private
     */
    private async createProfileForMyself(personEmail: string, takeOver?: boolean) {
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
        if (ContactModel.isProfileCRDTVersionedObjectResult(caughtObject)) {
            await serializeWithType('Contacts', async () => {
                await this.createSomeoneObjectIfNotExists(caughtObject);
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
                } catch {
                    // catch reached when there isn't a previous version
                    this.onNewCommunicationEndpointArrive.emit(
                        caughtObject.obj.communicationEndpoints
                    );
                    this.onProfileUpdate.emit(caughtObject.obj);

                    return;
                }
            });
        }
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
     * Creates a someone object and updates the contact app,  if the someone object doesn't exist.
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
     * Merge the new Profile with the older version.
     *
     * @param  profile - the given profile object
     * @param baseProfileHash - the base profile object hash
     */
    private async mergeProfile(
        profile: ProfileCRDT,
        baseProfileHash: SHA256Hash<ProfileCRDT>
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
