import type {
    OneUnversionedObjectInterfaces,
    OneVersionedObjectInterfaces
} from '@OneObjectInterfaces';
import {storeVersionedObjectCRDT} from '@refinio/one.core/lib/crdt';
import {getInstanceIdHash, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import type {
    OneIdObjectTypes,
    OneUnversionedObjectTypeNames,
    OneVersionedObjectTypeNames,
    OneVersionedObjectTypes,
    Person
} from '@refinio/one.core/lib/recipes';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage-unversioned-objects';
import {onUnversionedObj} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {
    IdFileCreation,
    VersionedObjectResult
} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    getIdObject,
    getObjectByIdHash,
    onIdObj,
    onVersionedObj
} from '@refinio/one.core/lib/storage-versioned-objects';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {LocalInstanceInfo} from '../../misc/CommunicationModule';
import {
    getInstancesOfPerson,
    getLocalInstanceOfPerson,
    hasPersonLocalInstance
} from '../../misc/instance';
import {OEvent} from '../../misc/OEvent';
import {createPerson, createPersonWithDefaultKeys, isPersonComplete} from '../../misc/person';
import type {ChannelEntry} from '../../recipes/ChannelRecipes';
import type {OneInstanceEndpoint} from '../../recipes/Leute/CommunicationEndpoints';
import type {Leute} from '../../recipes/Leute/Leute';
import type {PersonImage, PersonStatus} from '../../recipes/Leute/PersonDescriptions';
import type {Profile} from '../../recipes/Leute/Profile';
import type {Someone} from '../../recipes/Leute/Someone';
import type {ObjectData, QueryOptions} from '../ChannelManager';
import {Model} from '../Model';
import GroupModel from './GroupModel';
import ProfileModel from './ProfileModel';
import SomeoneModel from './SomeoneModel';

const ZERO_HASH = '0'.repeat(64);

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
export default class LeuteModel extends Model {
    public onProfileUpdate: OEvent<(profile: Profile) => void> = new OEvent();
    public onNewOneInstanceEndpointEvent = new OEvent<
        (communicationEndpoints: OneInstanceEndpoint) => void
    >();
    public beforeMainIdSwitch: OEvent<(identity: SHA256IdHash<Person>) => void> = new OEvent();
    public afterMainIdSwitch: OEvent<(identity: SHA256IdHash<Person>) => void> = new OEvent();

    public static readonly EVERYONE_GROUP_NAME = 'everyone';

    private readonly commserverUrl: string;

    private pLoadedVersion?: SHA256Hash<Leute>;
    private leute?: Leute;
    private readonly createEveryoneGroup: boolean;
    private shutdownInternal: () => Promise<void> = async () => {
        /*...*/
    };

    /**
     * Constructor
     *
     * @param commserverUrl - when creating the default oneInstanceEndpoint this url is used
     * @param createEveryoneGroup -  If true then init() should create an everyone group and add
     * listeners for new 'Person' objects and add them if they are not in the everyone group.
     * (default: false)
     */
    constructor(commserverUrl: string, createEveryoneGroup: boolean = false) {
        super();
        this.commserverUrl = commserverUrl;
        this.createEveryoneGroup = createEveryoneGroup;
    }

    /**
     * Init the module.
     *
     * This will initialize the data structures for 'me': someone, profile and a
     * OneInstanceEndpoint for the current instance.
     * As main identity the owner of the main one instance is used. This might change in the future!
     */
    public async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        // Reuse the instance and person from one.core
        const personId = getInstanceOwnerIdHash();
        if (personId === undefined) {
            throw new Error('The instance has no owner.');
        }

        const instanceId = getInstanceIdHash();
        if (instanceId === undefined) {
            throw new Error('The instance is not initialized.');
        }

        // One Instance endpoints for main instance with keys
        const endpoint: OneInstanceEndpoint = {
            $type$: 'OneInstanceEndpoint',
            personId,
            url: this.commserverUrl,
            instanceId: instanceId,
            instanceKeys: await getDefaultKeys(instanceId),
            personKeys: await getDefaultKeys(personId)
        };

        // Create the profile / someone objects. If they already exist, ONE and crdts will make sure
        // that creation is only done if the objects don't exist.
        const profile = await ProfileModel.constructWithNewProfile(personId, personId, 'default', [
            endpoint
        ]);
        const someone = await SomeoneModel.constructWithNewSomeone('me', profile.idHash);

        // Assign the leute object to the member for the saveAndLoad function
        // I know this member passing around isn't ideal. We should fix this later, to make it more
        // explicit what happens here.
        this.leute = {
            $type$: 'Leute',
            appId: 'one.leute',
            me: someone.idHash,
            other: [],
            group: []
        };
        await this.saveAndLoad();

        const disconnectFns: Array<() => void> = [];
        disconnectFns.push(onVersionedObj.addListener(this.addProfileFromResult.bind(this)));
        disconnectFns.push(
            onUnversionedObj.addListener(this.emitNewOneInstanceEndpointEvent.bind(this))
        );

        if (this.createEveryoneGroup) {
            const group = await this.createGroupInternal(LeuteModel.EVERYONE_GROUP_NAME);
            if (group.persons.find(person => person === personId) === undefined) {
                group.persons.push(personId);
                await group.saveAndLoad();
            }
            disconnectFns.push(
                onVersionedObj.addListener(this.addPersonToEveryoneGroup.bind(this))
            );
            disconnectFns.push(onIdObj.addListener(this.addIdPersonToEveryoneGroup.bind(this)));
        }

        this.shutdownInternal = async () => {
            for (const disconnectFn of disconnectFns) {
                disconnectFn();
            }
            this.leute = undefined;
            this.pLoadedVersion = undefined;
            this.shutdownInternal = async () => {
                /*...*/
            };
        };

        this.state.triggerEvent('init');
    }

    /**
     * Shutdown the leute model
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        await this.shutdownInternal();
        this.state.triggerEvent('shutdown');
    }

    // ######## Me management ########

    /**
     * Get the someone that represents me.
     */
    public async me(): Promise<SomeoneModel> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }
        return SomeoneModel.constructFromLatestVersion(this.leute.me);
    }

    /**
     * Get the someone that represents me, but don't load the data, yet.
     *
     * In order to use the returned model you have to call one of its load functions first.
     */
    public meLazyLoad(): SomeoneModel {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }
        return new SomeoneModel(this.leute.me);
    }

    // ######## Other people management ########

    /**
     * Get all other persons you know.
     */
    public async others(): Promise<SomeoneModel[]> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }
        return Promise.all(this.leute.other.map(SomeoneModel.constructFromLatestVersion));
    }

    /**
     * Get all other persons you know, but don't grab the data, yet.
     *
     * In order to use the returned models you have to call one of its load functions first.
     */
    public othersLazyLoad(): SomeoneModel[] {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }
        return this.leute.other.map(idHash => new SomeoneModel(idHash));
    }

    /**
     * Add a new person
     *
     * @param other
     */
    public async addSomeoneElse(other: SHA256IdHash<Someone>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }
        if (this.leute.me === other) {
            throw new Error('You cannot add yourself as other person');
        }

        const others = new Set(this.leute.other);
        others.add(other);
        this.leute.other = [...others];
        await this.saveAndLoad();
    }

    /**
     * Remove a person you know.
     *
     * @param other
     */
    public async removeSomeoneElse(other: SHA256IdHash<Someone>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        this.leute.other = this.leute.other.filter(o => o !== other);
        await this.saveAndLoad();
    }

    // ######## Identity management ########

    /**
     * Create a new identity and a 'default' profile for myself.
     */
    public async createProfileAndIdentityForMe(): Promise<ProfileModel> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const me = await this.me();
        const newPersonId = await LeuteModel.createIdentityWithInstanceAndKeys();
        const myIdentity = await me.mainIdentity();
        // add identity first so that the profile creation event has it
        await me.addIdentity(newPersonId);
        const newProfile = await ProfileModel.constructWithNewProfile(
            newPersonId,
            myIdentity,
            'default'
        );
        await me.addProfile(newProfile.idHash);
        return newProfile;
    }

    /**
     * Create a new identity and a 'default' profile for someone.
     */
    public async createProfileAndIdentityForSomeone(
        someoneId: SHA256IdHash<Someone>
    ): Promise<ProfileModel> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const someone = await SomeoneModel.constructFromLatestVersion(someoneId);
        const me = await this.me();

        if (me.idHash === someone.idHash) {
            return this.createProfileAndIdentityForMe();
        }

        const newPersonId = await LeuteModel.createIdentity();
        const myIdentity = await me.mainIdentity();
        // add identity first so that the profile creation event has it
        await someone.addIdentity(newPersonId);
        return someone.createProfile('default', newPersonId, myIdentity);
    }

    /**
     * Create a new profile for someone.
     */
    public async createProfileForSomeone(
        someoneId: SHA256IdHash<Someone>,
        personId: SHA256IdHash<Person>
    ): Promise<ProfileModel> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const someone = await SomeoneModel.constructFromLatestVersion(someoneId);
        const me = await this.me();
        const myIdentity = await me.mainIdentity();
        // check if identity is already managed
        if (!someone.identities().find(i => i === personId)) {
            // add identity first so that the profile creation event has it
            await someone.addIdentity(personId);
        }
        return someone.createProfile(await createRandomString(32), personId, myIdentity);
    }

    /**
     * Create someone with a completely new identity.
     */
    public async createSomeoneWithNewIdentity(): Promise<SHA256IdHash<Someone>> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const newPersonId = await LeuteModel.createIdentity();
        const me = await this.me();
        const myIdentity = await me.mainIdentity();
        const newProfile = await ProfileModel.constructWithNewProfile(
            newPersonId,
            myIdentity,
            'default'
        );
        const someoneNew = await SomeoneModel.constructWithNewSomeone(
            await createRandomString(32),
            newProfile.idHash
        );
        await this.addSomeoneElse(someoneNew.idHash);

        return someoneNew.idHash;
    }

    // ######## Group management ########

    /**
     * Create a new group.
     *
     * If it already exist this will return the existing group instead.
     *
     * @param name - If specified use this name, otherwise create a group with a random id.
     * @returns the created group or the existing one if it already existed.
     */
    public async createGroup(name?: string): Promise<GroupModel> {
        this.state.assertCurrentState('Initialised');
        return this.createGroupInternal(name);
    }

    /**
     * Get a list of groups.
     */
    public async groups(): Promise<GroupModel[]> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        return Promise.all(this.leute.group.map(GroupModel.constructFromLatestProfileVersion));
    }

    public static async everyoneGroup(): Promise<GroupModel> {
        try {
            return await GroupModel.constructFromLatestProfileVersionByGroupName(
                LeuteModel.EVERYONE_GROUP_NAME
            );
        } catch (e) {
            throw new Error(`Everyone group does not exist: ${e.message}`);
        }
    }

    // ######## Misc stuff ########

    /**
     * Return the SomeoneModel identified by the person Id or undefined otherwise.
     * @param personId
     */
    public async getSomeone(personId: SHA256IdHash<Person>): Promise<SomeoneModel | undefined> {
        this.state.assertCurrentState('Initialised');

        const allSomeones = [await this.me(), ...(await this.others())];
        return allSomeones.find(someone => someone.identities().includes(personId));
    }

    /**
     * Return the main ProfileModel of the SomeoneModel identified by the personId.
     * @param personId
     */
    public async getMainProfile(personId: SHA256IdHash<Person>): Promise<ProfileModel> {
        this.state.assertCurrentState('Initialised');

        const someone = await this.getSomeone(personId);

        if (someone === undefined) {
            throw new Error(`No someone found for the given personId: ${personId}`);
        }

        return someone.mainProfile();
    }

    /**
     * Sets a new profile for myself.
     *
     * If the profile has a different identity, than the old one the main identity will change!
     *
     * @param profileHash
     */
    public async setMyMainProfile(profileHash: SHA256IdHash<Profile>) {
        const profile = await getIdObject(profileHash);
        const mySomeone = await this.me();
        const oldIdentity = await mySomeone.mainIdentity();
        const newIdentity = profile.personId;

        if (oldIdentity === newIdentity) {
            await mySomeone.setMainProfile(profileHash);
        } else {
            this.beforeMainIdSwitch.emit(oldIdentity);
            if (!(await isPersonComplete(newIdentity))) {
                throw new Error('Person is not complete!');
            }
            await mySomeone.setMainProfile(profileHash);
            this.afterMainIdSwitch.emit(newIdentity);
        }
    }

    /**
     * Get my own main profile.
     */
    public async getMyMainProfile(): Promise<ProfileModel> {
        const mySomeone = await this.me();
        return await mySomeone.mainProfile();
    }

    /**
     * Change the main identity by setting a new mainProfile.
     *
     * @param newIdentity
     */
    public async changeMyMainIdentity(newIdentity: SHA256IdHash<Person>) {
        const mySomeone = await this.me();
        const oldIdentity = await mySomeone.mainIdentity();
        this.beforeMainIdSwitch.emit(oldIdentity);
        if (!(await isPersonComplete(newIdentity))) {
            throw new Error('Person is not complete!');
        }
        await mySomeone.setMainIdentity(newIdentity);
        this.afterMainIdSwitch.emit(newIdentity);
    }

    /**
     * Get my own main identity (at the moment from the main profile).
     */
    public async myMainIdentity(): Promise<SHA256IdHash<Person>> {
        const mySomeone = await this.me();
        return mySomeone.mainIdentity();
    }

    /**
     * Add a profile to a someone object already managing this persons identity.
     *
     * If no such someone object exists a new one is created.
     */
    public async addProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const profileObj = await getObjectByIdHash(profile);
        const others = await this.others();
        const me = await this.me();

        const someone = others.find(other => other.identities().includes(profileObj.obj.personId));
        if (someone === undefined) {
            // TODO: it might happen that it's in the process of creating the someone, but the
            //  profile was saved first. Maybe a lock is a better solution?
            // Current workaround: ignore the profiles written by the owner of this instance
            if (!me.identities().includes(profileObj.obj.owner)) {
                const someoneNew = await SomeoneModel.constructWithNewSomeone(
                    await createRandomString(32),
                    profile
                );
                await this.addSomeoneElse(someoneNew.idHash);
                this.onProfileUpdate.emit(profileObj.obj);
            }
        } else {
            // on sync it could happen that the first profile
            // is not the default one, so when the default
            // profile is synced, we should correct it.
            if (
                profileObj.obj.profileId === 'default' &&
                !me.identities().includes(profileObj.obj.owner)
            ) {
                await someone.setMainProfileIfNotDefault(profile);
            }

            await someone.addProfile(profile);

            this.onProfileUpdate.emit(profileObj.obj);
        }
    }

    /**
     * Get my own instance endpoints.
     *
     * @param mainOnly - If true, then only get endpoints for your main identity.
     */
    public async findAllOneInstanceEndpointsForMe(mainOnly = true): Promise<OneInstanceEndpoint[]> {
        this.state.assertCurrentState('Initialised');

        const me = await this.me();
        return me.collectAllEndpointsOfType(
            'OneInstanceEndpoint',
            mainOnly ? await me.mainIdentity() : undefined
        );
    }

    /**
     * Get all instance endpoints for person.
     *
     * @param personId
     */
    public async findAllOneInstanceEndpointsForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<OneInstanceEndpoint[]> {
        this.state.assertCurrentState('Initialised');

        const someone = await this.getSomeone(personId);
        if (someone === undefined) {
            throw new Error('');
        }
        return someone.collectAllEndpointsOfType('OneInstanceEndpoint', personId);
    }

    /**
     * Get instance endpoints from all contacts.
     */
    public async findAllOneInstanceEndpointsForOthers(): Promise<OneInstanceEndpoint[]> {
        this.state.assertCurrentState('Initialised');

        const others = await this.others();
        const endpoints = await Promise.all(
            others.map(someone => someone.collectAllEndpointsOfType('OneInstanceEndpoint'))
        );
        return endpoints.reduce((acc, curr) => acc.concat(curr), []);
    }

    /**
     * Collect all remote instances of my other devices.
     */
    public async getInternetOfMeEndpoints(): Promise<OneInstanceEndpoint[]> {
        const oneInstanceEndpoints: OneInstanceEndpoint[] = [];

        const me = await this.me();

        for (const identity of me.identities()) {
            const instances = await getInstancesOfPerson(identity);
            const instancesMap = new Map(
                instances.map(instance => [instance.instanceId, instance.local])
            );

            const endpoints = await me.collectAllEndpointsOfType('OneInstanceEndpoint', identity);

            // Only keep the endpoints for which we do not have a complete keypair => remote
            oneInstanceEndpoints.push(
                ...endpoints.filter(endpoint => {
                    const isLocal = instancesMap.get(endpoint.instanceId);

                    if (isLocal === undefined) {
                        console.error(
                            `Internal error: We do not have an instance object for the OneInstanceEndpoint, instanceId: ${endpoint.instanceId}`
                        );
                        return false;
                    }

                    return !isLocal;
                })
            );
        }

        return oneInstanceEndpoints;
    }

    /**
     * Collect all remote instances of everyone else.
     */
    public async getInternetOfPeopleEndpoints(): Promise<OneInstanceEndpoint[]> {
        return this.findAllOneInstanceEndpointsForOthers();
    }

    /**
     * Collect all IoM and IoP endpoints.
     */
    public async getAllRemoteEndpoints(): Promise<
        {
            endpoint: OneInstanceEndpoint;
            isIoM: boolean;
        }[]
    > {
        const iomEndpoints = await this.getInternetOfMeEndpoints();
        const iopEndpoints = await this.getInternetOfPeopleEndpoints();

        return [
            ...iomEndpoints.map(endpoint => ({
                endpoint,
                isIoM: true
            })),
            ...iopEndpoints.map(endpoint => ({
                endpoint,
                isIoM: false
            }))
        ];
    }

    /**
     *  Collect all local instances that represent this device.
     *
     *  Note: LeuteModel is probably not the correct place for this ... but instances.ts neither
     */
    public async getMyLocalInstances(): Promise<LocalInstanceInfo[]> {
        const me = await this.me();

        const localInstances: LocalInstanceInfo[] = [];
        for (const identity of me.identities()) {
            if (!(await hasPersonLocalInstance(identity))) {
                continue;
            }

            const instanceId = await getLocalInstanceOfPerson(identity);

            localInstances.push({
                instanceId,
                cryptoApi: await createCryptoApiFromDefaultKeys(instanceId),
                instanceKeys: await getPublicKeys(await getDefaultKeys(instanceId)),
                personId: identity
            });
        }

        return localInstances;
    }

    /**
     *  Collect all local instances that represent this device.
     *
     *  Note: LeuteModel is probably not the correct place for this ... but instances.ts neither
     */
    public async getMyMainInstance(): Promise<LocalInstanceInfo> {
        const me = await this.me();

        const identity = await me.mainIdentity();
        const instanceId = await getLocalInstanceOfPerson(identity);

        return {
            instanceId,
            cryptoApi: await createCryptoApiFromDefaultKeys(instanceId),
            instanceKeys: await getPublicKeys(await getDefaultKeys(instanceId)),
            personId: identity
        };
    }

    /**
     * Get the profile name from the main profile.
     *
     * @param person
     */
    public async getMainProfileDisplayName(person: SHA256IdHash<Person>): Promise<string> {
        try {
            const profile = await this.getMainProfile(person);
            const personNames = profile.descriptionsOfType('PersonName');
            if (personNames.length === 0) {
                return 'undefined';
            }
            return personNames[0].name;
        } catch (_) {
            return 'undefined';
        }
    }

    /**
     * Get the profile name from one of the default profiles.
     *
     * It will first try to find the profile that we edited (I am owner).
     * Then it will try to find the profile that the person itself edited (He is owner)
     * Then it will look for a default profile from any owner.
     *
     * @param person
     */
    public async getDefaultProfileDisplayName(person: SHA256IdHash<Person>): Promise<string> {
        try {
            const someone = await this.getSomeone(person);
            if (someone === undefined) {
                return 'undefined';
            }
            const profiles = await someone.profiles(person);
            const defaultProfiles = profiles.filter(profile => profile.profileId === 'default');

            const myId = await this.myMainIdentity();
            const meOwner = LeuteModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                profile => profile.owner === myId
            );
            if (meOwner !== undefined) {
                return meOwner;
            }

            const selfOwner = LeuteModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                profile => profile.owner === person
            );
            if (selfOwner !== undefined) {
                return selfOwner;
            }

            const anyOwner = LeuteModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                _profile => true
            );
            if (anyOwner !== undefined) {
                return anyOwner;
            }

            return person;
        } catch (_) {
            return person;
        }
    }

    /**
     * Returns items for pictures that were updated.
     *
     * @param _queryOptions
     */
    public async *retrievePersonImagesForJournal(
        _queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<PersonImage>> {
        this.state.assertCurrentState('Initialised');

        const allProfiles = await this.getAllProfiles();

        const imagesWithPersonId: {personId: SHA256IdHash<Person>; image: PersonImage}[] = [];

        allProfiles.forEach((profile: ProfileModel) => {
            profile.descriptionsOfType('PersonImage').forEach(pi => {
                imagesWithPersonId.push({personId: profile.personId, image: pi});
            });
        });

        imagesWithPersonId.sort((imageWithPersonId1, imageWIthPersonId2) => {
            return imageWithPersonId1.image.timestamp < imageWIthPersonId2.image.timestamp
                ? 1
                : imageWithPersonId1.image.timestamp > imageWIthPersonId2.image.timestamp
                ? -1
                : 0;
        });

        const objectDatas = imagesWithPersonId.map(imageWithPersonId => {
            return {
                channelId: '',
                channelOwner: ZERO_HASH as SHA256IdHash<Person>,
                channelEntryHash: ZERO_HASH as SHA256Hash<ChannelEntry>,
                id: '',
                creationTime: new Date(imageWithPersonId.image.timestamp),
                author: imageWithPersonId.personId,
                sharedWith: [],
                data: imageWithPersonId.image,
                dataHash: ZERO_HASH as SHA256Hash<PersonImage>
            };
        });

        yield* objectDatas;
    }

    /**
     * Returns items for statuses that were updated.
     *
     * @param _queryOptions
     */
    public async *retrieveStatusesForJournal(
        _queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<PersonStatus>> {
        this.state.assertCurrentState('Initialised');

        const allProfiles = await this.getAllProfiles();

        const statusesWithPersonId: {
            personId: SHA256IdHash<Person>;
            status: PersonStatus;
        }[] = [];

        allProfiles.forEach((profile: ProfileModel) => {
            profile.descriptionsOfType('PersonStatus').forEach(ps => {
                statusesWithPersonId.push({personId: profile.personId, status: ps});
            });
        });

        statusesWithPersonId.sort((status1, status2) => {
            return status1.status.timestamp < status2.status.timestamp
                ? 1
                : status1.status.timestamp > status2.status.timestamp
                ? -1
                : 0;
        });

        const objectDatas = statusesWithPersonId.map(statusWithPersonId => {
            return {
                channelId: '',
                channelOwner: ZERO_HASH as SHA256IdHash<Person>,
                channelEntryHash: ZERO_HASH as SHA256Hash<ChannelEntry>,
                id: '',
                creationTime: new Date(statusWithPersonId.status.timestamp),
                author: statusWithPersonId.personId,
                sharedWith: [],
                data: statusWithPersonId.status,
                dataHash: ZERO_HASH as SHA256Hash<PersonStatus>
            };
        });

        yield* objectDatas;
    }

    // ######## Private stuff ########

    /**
     * Create a new group.
     *
     * If it already exist this will return the existing group instead.
     *
     * @param name - If specified use this name, otherwise create a group with a random id.
     * @returns the created group or the existing one if it already existed.
     */
    private async createGroupInternal(name?: string): Promise<GroupModel> {
        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const group = await GroupModel.constructWithNewGroup(name);
        if (!this.leute.group.includes(group.groupIdHash)) {
            this.leute.group.push(group.groupIdHash);
            await this.saveAndLoad();
        }
        return group;
    }

    /**
     * Create an identity and an instance and corresponding keys
     */
    private static async createIdentityWithInstanceAndKeys(): Promise<SHA256IdHash<Person>> {
        const personResult = await createPersonWithDefaultKeys();
        // const instanceResult = createInstanceWithDefaultKeys(personResult.personId);
        return personResult.personId;
    }

    /**
     * Create an identity without any keys instance objects, etc.
     */
    private static async createIdentity(): Promise<SHA256IdHash<Person>> {
        return createPerson();
    }

    // ######## Hooks for one.core ########

    /**
     * Add a profile to the respective someone object.
     *
     * This call is registered at one.core for listening for new profiles.
     *
     * @param result
     * @private
     */
    private async addProfileFromResult(result: VersionedObjectResult): Promise<void> {
        if (isVersionedResultOfType(result, 'Profile')) {
            await serializeWithType('addProfile', async () => {
                await this.addProfile(result.idHash);
            });
            this.onUpdated.emit();
        }
    }

    /**
     * Add a person to the respective {@link LeuteModel.EVERYONE_GROUP_NAME} group.
     *
     * This call is registered at one.core for listening for new persons.
     *
     * @param result
     * @private
     */
    private async addPersonToEveryoneGroup(result: VersionedObjectResult): Promise<void> {
        if (isVersionedResultOfType(result, 'Person')) {
            await serializeWithType('addPerson', async () => {
                const group = await LeuteModel.everyoneGroup();
                if (group.persons.find(person => person === result.idHash) === undefined) {
                    group.persons.push(result.idHash);
                    await group.saveAndLoad();
                }
            });
        }
    }

    /**
     * Add a person to the respective {@link LeuteModel.EVERYONE_GROUP_NAME} group.
     *
     * This call is registered at one.core for listening for new persons.
     *
     * @param result
     * @private
     */
    private async addIdPersonToEveryoneGroup(
        result: IdFileCreation<OneVersionedObjectTypes | OneIdObjectTypes>
    ): Promise<void> {
        const object = await getIdObject(
            result.idHash as unknown as SHA256IdHash<OneVersionedObjectTypes>
        );
        if (object.$type$ === 'Person') {
            await serializeWithType('addPerson', async () => {
                const group = await LeuteModel.everyoneGroup();
                if (group.persons.find(person => person === result.idHash) === undefined) {
                    group.persons.push(result.idHash as SHA256IdHash<Person>);
                    await group.saveAndLoad();
                }
            });
        }
    }

    /**
     * Emit the appropriate event for the CommunicationModule. Otherwise it's not added to the
     * list of known connections.
     * @param result
     * @private
     */
    private emitNewOneInstanceEndpointEvent(result: UnversionedObjectResult): void {
        if (isUnversionedResultOfType(result, 'OneInstanceEndpoint')) {
            this.onNewOneInstanceEndpointEvent.emit(result.obj);
        }
    }

    /**
     * Updates the this.leute member on a new version.
     *
     * This call is registered at one.core for listening for new leute object versions.
     *
     * @param result
     * @private
     */
    private async updateLeuteMember(result: VersionedObjectResult) {
        if (isVersionedResultOfType(result, 'Leute')) {
            this.leute = result.obj;
            this.pLoadedVersion = result.hash;
            this.onUpdated.emit();
        }
    }

    private static getPersonNameFromFilteredProfiles(
        profiles: ProfileModel[],
        predicate: (profile: ProfileModel) => boolean
    ): string | undefined {
        const filteredProfiles = profiles.filter(predicate);
        for (const profile of filteredProfiles) {
            const personNames = profile.descriptionsOfType('PersonName');
            if (personNames.length > 0) {
                return personNames[0].name;
            }
        }
        return undefined;
    }

    // ######## private stuff - Load & Save ########

    /**
     * Return all the profiles of all the someones, including my own profiles.
     */
    private async getAllProfiles(): Promise<ProfileModel[]> {
        const someoneModels = [await this.me(), ...(await this.others())];

        const profileModels2d = await Promise.all(
            someoneModels.map((other: SomeoneModel) => {
                return other.profiles();
            })
        );

        return profileModels2d.reduce((prev, next) => {
            return prev.concat(next);
        });
    }

    /**
     * Save the leute to disk and load the latest version.
     *
     * Why is there no pure save() function? The cause are crdts. The object that is eventually
     * written to disk might differ from the current state of this instance. This happens when new
     * data was received via chum since the last load. This means that we don't have a hash
     * representing the current state.
     *
     * TODO: It is possible to write the intermediary state and obtain a hash. So we can implement a
     *       pure save() function. But this requires the lower levels to write the top level object
     *       of the tree and return the corresponding hash to the caller. The
     *       storeVersionedObjectCRDT and the plan interfaces don't support that right now in a easy
     *       to grasp way.
     */
    private async saveAndLoad(): Promise<void> {
        if (this.leute === undefined) {
            throw new Error('No leute data that could be saved');
        }

        const result = await storeVersionedObjectCRDT(this.leute, this.pLoadedVersion);

        await this.updateModelDataFromLeute(result.obj, result.hash);

        this.onUpdated.emit();
    }

    /**
     * Updates the members of the model based on a loaded profile and the version hash.
     *
     * @param leute
     * @param version
     * @private
     */
    private async updateModelDataFromLeute(
        leute: Leute,
        version: SHA256Hash<Leute>
    ): Promise<void> {
        this.pLoadedVersion = version;
        this.leute = leute;
    }
}

// ######## private functions ########

function isVersionedResultOfType<T extends OneVersionedObjectTypeNames>(
    versionedObjectResult: VersionedObjectResult,
    type: T
): versionedObjectResult is VersionedObjectResult<OneVersionedObjectInterfaces[T]> {
    return versionedObjectResult.obj.$type$ === type;
}

function isUnversionedResultOfType<T extends OneUnversionedObjectTypeNames>(
    unversionedObjectResult: UnversionedObjectResult,
    type: T
): unversionedObjectResult is UnversionedObjectResult<OneUnversionedObjectInterfaces[T]> {
    return unversionedObjectResult.obj.$type$ === type;
}
