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
    onVersionedObj
} from 'one.core/lib/storage';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {serializeWithType} from 'one.core/lib/util/promise';
import OneInstanceModel from './OneInstanceModel';
import EventEmitter from 'events';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import {getAllEntries} from 'one.core/lib/reverse-map-query';

/**
 * This represents a ContactEvent
 * @enum UpdatedContactList -> this event retrieves ContactApp.obj.contacts ( a list of SHA256Hash<Someones> )
 *       UpdatedContact -> this event retrieves the updated Profile object ( an object of type VersionedObjectResult<Profile> )
 */
export enum ContactEvent {
    UpdatedContactList = 'UPDATED_CONTACT_LIST',
    UpdatedContact = 'UPDATED_CONTACT',
    UpdatedContactApp = 'UPDATED_CONTACT_APP'
}

/**
 *
 * @description Contact Model class
 * @augments EventEmitter
 */
export default class ContactModel extends EventEmitter {
    constructor(oneInstanceModel: OneInstanceModel) {
        super();
        this.oneInstanceModel = oneInstanceModel;
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
     * @param {boolean} takeOver - in instance take over just register hooks and wait for the contact app from the otehr instance
     * @returns {Promise<void>}
     */
    async init(takeOver = false) {
        this.registerHooks();

        if (await ContactModel.doesContactAppObjectExist()) {
            await this.shareContactAppWithYourInstances();

            return;
        }

        if(!takeOver) {
            await createSingleObjectThroughPurePlan({module: '@module/setupInitialProfile'});
            await this.shareContactAppWithYourInstances();
        }

    }

    /**
     * @description Create a new personId and an associated profile.
     * @param {boolean} myself
     * @param {SHA256IdHash<Person>} email
     * @returns {Promise<SHA256IdHash<Person>>}
     */
    public async createProfile(myself: boolean, email?: string): Promise<SHA256IdHash<Person>> {
        const personEmail = email === undefined ? await createRandomString(20) : email;

        const createdProfile = await this.serializeProfileCreatingByPersonEmail(
            personEmail,
            myself
        );
        return createdProfile.obj.personId;
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
     * @returns {Promise<SHA256IdHash<Person>[]> | Promise<undefined>}
     */
    public async listAlternateIdentities(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256IdHash<Person>[] | undefined> {
        /** Find the someone object that references the passed person id hash **/
        const otherPersonSomeoneObject = await this.getSomeoneObject(personId);

        if (otherPersonSomeoneObject === undefined) {
            return undefined;
        }

        /** Iterate over all profile objects in someone object and add the person id hash
         *  to the return list.
         **/
        const identities = await Promise.all(
            otherPersonSomeoneObject.profiles.map(
                async (profileIdHash: SHA256IdHash<Profile>) =>
                    (await getObjectByIdHash(profileIdHash)).obj.personId
            )
        );
        /** Remove the passed person id hash from the list **/
        identities.splice(identities.indexOf(personId), 1);
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
     * @description Merges contact objects
     * e.g for descriptions -> [{type: 'Name', personName: 'name'}, {type: 'Image', personImage: 'someBLOB'}]
     * will be converted into {personName: 'Name', personImage: 'someBLOB'}
     * @param {SHA256IdHash<Person>} personId
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
     * HOOK function
     * @description Serialized since it's part of an object listener
     * If the profile does not exist, it will be created assuming it's for another person
     * @param {Contact} contact
     * @param {boolean} useAsMainContact
     * @returns {Promise<void>}
     */
    public async addNewContactObject(
        contact: UnversionedObjectResult<Contact>,
        useAsMainContact: boolean
    ): Promise<void> {
        /** first, we need to get the personId from the contact **/
        const personId = contact.obj.personId;
        const personEmail = (await getObjectByIdHash(personId)).obj.email;

        let profile: VersionedObjectResult<Profile>;

        /** see if the profile does exist **/
        try {
            profile = await serializeWithType(personEmail, async () => {
                return await getObjectByIdObj({$type$: 'Profile', personId: personId});
            });
        } catch (e) {
            /** otherwise create a new profile and register it with serialization **/
            profile = await this.serializeProfileCreatingByPersonEmail(personEmail, false);
        }

        const existingContact = profile.obj.contactObjects.find(
            (contactHash: SHA256Hash<Contact>) => contactHash === contact.hash
        );

        if (existingContact && !useAsMainContact) {
            return;
        }

        if (useAsMainContact) {
            profile.obj.mainContact = contact.hash;
        }

        if (existingContact) {
            return;
        }
        profile.obj.contactObjects.push(contact.hash);

        /** update the profile **/
        await serializeWithType(personEmail, async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                profile.obj
            );
        });
        this.emit(ContactEvent.UpdatedContact, profile);
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

    /** ########################################## Private ########################################## **/

    private readonly oneInstanceModel: OneInstanceModel;

    /**
     * @description Serialized profile creation wrapper
     * @param {string} personEmail
     * @param {boolean} forMyself
     */
    private async serializeProfileCreatingByPersonEmail(
        personEmail: string,
        forMyself: boolean
    ): Promise<VersionedObjectResult<Profile>> {
        if (forMyself) {
            return await serializeWithType(personEmail, async () => {
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createOwnProfile'},
                    personEmail,
                    this.oneInstanceModel.getSecret()
                )) as VersionedObjectResult<Profile>;
                await this.registerNewSelfProfile(profile);
                return profile;
            });
        } else {
            return await serializeWithType(personEmail, async () => {
                const profile = (await createSingleObjectThroughPurePlan(
                    {module: '@module/createProfile'},
                    personEmail
                )) as VersionedObjectResult<Profile>;
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
     * @description Register the needed hooks
     * @returns {void}
     */
    private registerHooks(): void {
        /**
         * Creating new instances for your profiles
         */
        onVersionedObj.addListener(async (caughtObject: VersionedObjectResult) => {
            if (this.isContactAppVersionedObjectResult(caughtObject)) {
                const updatedSomeoneObjectForMyself = await getObject(caughtObject.obj.me);
                /** exploding profiles **/
                const profiles = await Promise.all(
                    updatedSomeoneObjectForMyself.profiles.map(
                        async (profileIdHash: SHA256IdHash<Profile>) => {
                            return await getObjectByIdHash(profileIdHash);
                        }
                    )
                );
                await Promise.all(
                    profiles.map(async (profile: VersionedObjectResult<Profile>) => {
                        const personEmail = (await getObjectByIdHash(profile.obj.personId)).obj
                            .email;
                        /** see if the instance exists **/
                        const instance = await getAllEntries(
                            profile.obj.personId,
                            true,
                            'Instance'
                        );
                        if (
                            Array.from(instance.keys()).length === 0 &&
                            (await getInstanceOwnerIdHash()) !== profile.obj.personId
                        ) {
                            await this.serializeProfileCreatingByPersonEmail(personEmail, true);
                        }
                    })
                );
                this.emit(ContactEvent.UpdatedContactApp);
            }
        });
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (this.isContactUnVersionedObjectResult(caughtObject)) {
                await this.addNewContactObject(caughtObject, false);
            }
        });
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
