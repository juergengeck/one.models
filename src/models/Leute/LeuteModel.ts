import type {Profile} from '../../recipes/Leute/Profile';
import {
    onUnversionedObj,
    onVersionedObj,
    UnversionedObjectResult,
    VersionedObjectResult
} from 'one.core/lib/storage';
import {getObjectByIdHash, storeVersionedObject} from 'one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import SomeoneModel from './SomeoneModel';
import type {Someone} from '../../recipes/Leute/Someone';
import type {Leute} from '../../recipes/Leute/Leute';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import {getInstanceIdHash, getInstanceOwnerIdHash} from 'one.core/lib/instance';
import type InstancesModel from '../InstancesModel';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import type {
    Keys,
    OneUnversionedObjectTypeNames,
    OneVersionedObjectTypeNames,
    Person,
    Plan
} from 'one.core/lib/recipes';
import type {OneInstanceEndpoint} from '../../recipes/Leute/CommunicationEndpoints';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {storeVersionedObjectCRDT} from 'one.core/lib/crdt';
import ProfileModel from './ProfileModel';
import type {
    OneUnversionedObjectInterfaces,
    OneVersionedObjectInterfaces
} from '@OneObjectInterfaces';
import {OEvent} from '../../misc/OEvent';
import {serializeWithType} from 'one.core/lib/util/promise';
import type {Model} from '../Model';
import type {ObjectData, QueryOptions} from '../ChannelManager';
import type {PersonImage, PersonStatus} from '../../recipes/Leute/PersonDescriptions';
import type {ChannelEntry} from '../../recipes/ChannelRecipes';
import GroupModel from './GroupModel';
import type {StateMachine} from '../../misc/StateMachine';
import {createModelStateMachine} from '../Model';

const DUMMY_PLAN_HASH: SHA256Hash<Plan> =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

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
export default class LeuteModel implements Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    public onUpdated: OEvent<() => void> = new OEvent();
    public onProfileUpdate: OEvent<(profile: Profile) => void> = new OEvent();
    public onNewOneInstanceEndpointEvent = new OEvent<
        (communicationEndpoints: OneInstanceEndpoint) => void
    >();

    private readonly instancesModel: InstancesModel;
    private readonly commserverUrl: string;

    private pLoadedVersion?: SHA256Hash<Leute>;
    private leute?: Leute;

    private readonly boundAddProfileFromResult: (
        versionedObjectResult: VersionedObjectResult
    ) => Promise<void>;
    private readonly boundUpdateLeuteMember: (
        versionedObjectResult: VersionedObjectResult
    ) => Promise<void>;

    private readonly boundNewOneInstanceEndpointFromResult: (
        unversionedObjectResult: UnversionedObjectResult
    ) => void;

    /**
     * Constructor
     *
     * @param instancesModel - The instances model used to create new local instances for a new 'me' identity
     * @param commserverUrl - when creating the default oneInstanceEndpoint this url is used
     */
    constructor(instancesModel: InstancesModel, commserverUrl: string) {
        this.instancesModel = instancesModel;
        this.boundAddProfileFromResult = this.addProfileFromResult.bind(this);
        this.boundUpdateLeuteMember = this.updateLeuteMember.bind(this);
        this.boundNewOneInstanceEndpointFromResult =
            this.emitNewOneInstanceEndpointEvent.bind(this);
        this.commserverUrl = commserverUrl;

        this.state = createModelStateMachine();
    }

    /**
     * Init the module.
     *
     * This will initialize the data structures for 'me': someone, profile and a
     * OneInstanceEndpoint for the current instance.
     * As main identity the owner of the main one instance is used. This might change in the future!
     */
    public async init(): Promise<void> {
        // Reuse the instance and person from one.core
        const personId = getInstanceOwnerIdHash();
        if (personId === undefined) {
            throw new Error('The instance has no owner.');
        }

        const instanceId = await getInstanceIdHash();
        if (instanceId === undefined) {
            throw new Error('The instance is not initialized.');
        }

        // One Instance endpoints for main instance with keys
        const endpoint: OneInstanceEndpoint = {
            $type$: 'OneInstanceEndpoint',
            personId,
            url: this.commserverUrl,
            instanceId: instanceId,
            instanceKeys: await this.instancesModel.localInstanceKeysHash(instanceId),
            personKeys: await LeuteModel.personKeysHashForPerson(personId)
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

        onVersionedObj.addListener(this.boundAddProfileFromResult);
        onUnversionedObj.addListener(this.boundNewOneInstanceEndpointFromResult);

        this.state.triggerEvent('init');
    }

    /**
     * Shutdown the leute model
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        onVersionedObj.removeListener(this.boundAddProfileFromResult);
        onUnversionedObj.removeListener(this.boundNewOneInstanceEndpointFromResult);
        this.leute = undefined;
        this.pLoadedVersion = undefined;

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

        this.leute.other = this.leute.other.filter(o => o != other);
        await this.saveAndLoad();
    }

    // ######## Identity management ########

    /**
     * Create a new identity and a 'default' profile for myself.
     */
    public async createProfileAndIdentityForMe(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const newPersonId = await this.createIdentityWithInstanceAndKeys();
        const newProfile = await ProfileModel.constructWithNewProfile(
            newPersonId,
            newPersonId,
            'default'
        );
        const me = await this.me();
        await me.addIdentity(newPersonId);
        await me.addProfile(newProfile.idHash);
    }

    /**
     * Create someone with a completely new identity.
     */
    public async createSomeoneWithNewIdentity(): Promise<SHA256IdHash<Someone>> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const myIdentity = await (await this.me()).mainIdentity();
        const newPersonId = await LeuteModel.createIdentity();
        const newProfile = await ProfileModel.constructWithNewProfile(
            newPersonId,
            myIdentity,
            'default'
        );
        const newSomeone = await SomeoneModel.constructWithNewSomeone(
            await createRandomString(32),
            newProfile.idHash
        );

        await this.addSomeoneElse(newSomeone.idHash);

        return newSomeone.idHash;
    }

    // ######## Group management ########

    /**
     * Create a new group.
     *
     * @param name - If specified use this name, otherwise create a group with a random id.
     * @returns the id of the generated group.
     */
    public async createGroup(name?: string): Promise<GroupModel> {
        this.state.assertCurrentState('Initialised');

        if (this.leute === undefined) {
            throw new Error('Leute model is not initialized');
        }

        const group = await GroupModel.constructWithNewGroup(name);
        this.leute.group.push(group.groupIdHash);
        await this.saveAndLoad();
        return group;
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
     * Add a profile to a someone object already managing this persons profile.
     *
     * If no such someone object exists a new one is created.
     */
    public async addProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const profileObj = await getObjectByIdHash(profile);
        const others = await this.others();

        const someone = others.find(other => other.identities().includes(profileObj.obj.personId));
        if (someone === undefined) {
            // TODO: it might happen that it's in the process of creating the someone, but the
            //  profile was saved first. Maybe a lock is a better solution?
            // Current workaround: ignore the profiles written by the owner of this instance
            const me = await this.me();
            if (!me.identities().includes(profileObj.obj.owner)) {
                const someoneNew = await SomeoneModel.constructWithNewSomeone(
                    await createRandomString(32),
                    profile
                );
                await this.addSomeoneElse(someoneNew.idHash);
                this.onProfileUpdate.emit(profileObj.obj);
            }
        } else {
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
     * Return the person keys for a specific person.
     *
     * @param personId - the given person id
     * @returns the list of keys
     */
    public static async personKeysHashForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256Hash<Keys>> {
        const personKeyLink = await getAllValues(personId, true, 'Keys');
        return personKeyLink[personKeyLink.length - 1].toHash;
    }

    /**
     * Returns items for pictures that were updated.
     *
     * @param queryOptions
     */
    public async *retrievePersonImagesForJournal(
        queryOptions?: QueryOptions
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
            return imageWithPersonId1.image.timestamp > imageWIthPersonId2.image.timestamp
                ? 1
                : imageWithPersonId1.image.timestamp < imageWIthPersonId2.image.timestamp
                ? -1
                : 0;
        });

        const objectDatas = imagesWithPersonId.map(imageWithPersonId => {
            return {
                channelId: '',
                channelOwner:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256IdHash<Person>,
                channelEntryHash:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<ChannelEntry>,
                id: '',
                creationTime: new Date(imageWithPersonId.image.timestamp),
                author: imageWithPersonId.personId,
                sharedWith: [],
                data: imageWithPersonId.image,
                dataHash:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<PersonImage>
            };
        });

        yield* objectDatas;
    }

    /**
     * Returns items for statuses that were updated.
     *
     * @param queryOptions
     */
    public async *retrieveStatusesForJournal(
        queryOptions?: QueryOptions
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
            return status1.status.timestamp > status2.status.timestamp
                ? 1
                : status1.status.timestamp < status2.status.timestamp
                ? -1
                : 0;
        });

        const objectDatas = statusesWithPersonId.map(statusWithPersonId => {
            return {
                channelId: '',
                channelOwner:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256IdHash<Person>,
                channelEntryHash:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<ChannelEntry>,
                id: '',
                creationTime: new Date(statusWithPersonId.status.timestamp),
                author: statusWithPersonId.personId,
                sharedWith: [],
                data: statusWithPersonId.status,
                dataHash:
                    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<PersonStatus>
            };
        });

        yield* objectDatas;
    }

    // ######## Private stuff ########

    /**
     * Create an identity and an instance and corresponding keys
     */
    private async createIdentityWithInstanceAndKeys(): Promise<SHA256IdHash<Person>> {
        const newPersonEmail = await createRandomString(32);

        // Note that createLocalInstanceByEMail also creates the person and keys if they do not
        // exist. From the architecture point of view this is bullshit, so we should reconcile
        // it. But this also requires some decent key management ... which comes later
        await this.instancesModel.createLocalInstanceByEMail(newPersonEmail);
        return await calculateIdHashOfObj({
            $type$: 'Person',
            email: newPersonEmail
        });
    }

    /**
     * Create an identity without any keys instance objects, etc.
     */
    private static async createIdentity(): Promise<SHA256IdHash<Person>> {
        const newPersonEmail = await createRandomString(32);
        const result = await storeVersionedObject(
            {
                $type$: 'Person',
                email: newPersonEmail
            },
            DUMMY_PLAN_HASH
        );
        return result.idHash;
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
     * Emit the appropiate event for the CommunicationModule. Otherwise it's not added to the
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

        return profileModels2d.reduce(function (prev, next) {
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

        const result = await storeVersionedObjectCRDT(
            this.leute,
            this.pLoadedVersion,
            DUMMY_PLAN_HASH
        );

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
