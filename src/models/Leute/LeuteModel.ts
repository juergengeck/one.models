import type {Profile} from '../../recipes/Leute/Profile';
import {createSingleObjectThroughPurePlan, VersionedObjectResult} from 'one.core/lib/storage';
import {getObjectByIdHash, storeVersionedObject} from 'one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import SomeoneModel, {createSomeone, loadSomeone} from './SomeoneModel';
import type {Someone} from '../../recipes/Leute/Someone';
import type {Leute} from '../../recipes/Leute/Leute';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import {createProfile} from './ProfileModel';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import type InstancesModel from '../InstancesModel';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import type {Person, Plan} from 'one.core/lib/recipes';
import type {
    CommunicationEndpointTypes,
    OneInstanceEndpoint
} from '../../recipes/Leute/CommunicationEndpoints';

type Writeable<T> = {-readonly [K in keyof T]: T[K]};

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
 *
 * TODO: Add convenience functions for locating all one endpoints, locating keys ...
 * TODO: Add events
 */
export default class LeuteModel {
    instancesModel: InstancesModel;

    constructor(instancesModel: InstancesModel, commserverUrl: string) {
        this.instancesModel = instancesModel;
    }

    async init(): Promise<void> {
        // We currently get 'me' from the instance owner, because it was already created and
        // is constant over multiple login attempts. When using a new identity we would have to
        // generate a new person based on whether the leute object exists - or not.
        // Until we had a more thorough look at instance creation we will keep it that way.
        const personId = getInstanceOwnerIdHash();
        if (personId === undefined) {
            throw new Error('The instance has no owner.');
        }

        // Create the profile / someone objects. If they already exist, ONE and crdts will make sure
        // that creation is only done if the objects don't exist.
        const profile = await createProfile(personId, personId, 'default');
        const someone = await createSomeone('me', profile.idHash);
        await createLeute(someone.idHash);
    }

    async shutdown(): Promise<void> {}

    // ######## Me management ########

    /**
     * Get the someone object that represents me.
     */
    async me(): Promise<SomeoneModel> {
        const leute = await loadLeute();
        return loadSomeone(leute.obj.me);
    }

    /**
     * Set the someone object that represents me.
     *
     * Warning: this might have unintended consequences at the moment. We set it, but what will
     * happen in applications is currently not ... known. Loots of modules rely on 'me' not to
     * change.
     *
     * @param me - The 'Someone' objects hash that should be the new 'me'.
     */
    async setMe(me: SHA256IdHash<Someone>): Promise<void> {
        const leute = await loadLeute();

        // Remove me from others
        const others = new Set(leute.obj.other);
        others.delete(me);

        await saveLeute(me, others, leute.hash);
    }

    // ######## Other people management ########

    /**
     * Get all other persons you know.
     */
    async others(): Promise<SomeoneModel[]> {
        const leute = await loadLeute();
        return Promise.all(leute.obj.other.map(loadSomeone));
    }

    /**
     * Add a new person
     *
     * @param other
     */
    async addOther(other: SHA256IdHash<Someone>): Promise<void> {
        const leute = await loadLeute();

        if (leute.obj.me === other) {
            throw new Error('You cannot add yourself as other person');
        }

        const others = new Set(leute.obj.other);
        others.add(other);
        await saveLeute(leute.obj.me, others, leute.hash);
    }

    /**
     * Remove a person you know.
     *
     * @param other
     */
    async removeOther(other: SHA256IdHash<Someone>): Promise<void> {
        const leute = await loadLeute();
        const others = new Set(leute.obj.other);
        others.delete(other);
        await saveLeute(leute.obj.me, others, leute.hash);
    }

    // ######## Identity management ########

    /**
     * Create a new identity an a 'default' profile.
     *
     * @returns {Promise<void>}
     */
    async createProfileAndIdentityForMe(): Promise<void> {
        const newPersonId = await this.createIdentityWithInstanceAndKeys();
        const newProfile = await createProfile(newPersonId, newPersonId, 'default');
        const me = await this.me();
        await me.addIdentity(newPersonId);
        await me.addProfile(newProfile.idHash);
    }

    /**
     * Create a new identity for me and also create a profile.
     *
     * @returns {Promise<void>}
     */
    async createSomeoneWithNewIdentity(): Promise<void> {
        const newPersonId = await LeuteModel.createIdentity();
        const newProfile = await createProfile(newPersonId, newPersonId, 'default');
        const newSomeone = await createSomeone(await createRandomString(32), newProfile.idHash);

        const leute = await loadLeute();
        const others = new Set(leute.obj.other);
        others.add(newSomeone.idHash);
        await saveLeute(leute.obj.me, others, leute.hash);
    }

    // ######## Misc stuff ########

    /**
     * Add a profile to a someone object already managing this persons profile.
     *
     * If no such someone object exists a new one is created.
     */
    async addProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        const profileObj = await getObjectByIdHash(profile);
        const others = await this.others();

        const someone = others.find(other => other.identities().includes(profileObj.obj.personId));
        if (someone === undefined) {
            const someoneNew = await createSomeone('', profile);
            await this.addOther(someoneNew.idHash);
        } else {
            await someone.addProfile(profile);
        }
    }

    /**
     * Get my own instance endpoints.
     *
     * @param mainOnly - If true, then only get endpoints for your main identity.
     */
    public async findAllOneInstanceEndpointsForMe(mainOnly = true): Promise<OneInstanceEndpoint[]> {
        const me = await this.me();
        const profiles = await me.profiles(mainOnly ? await me.mainIdentity() : undefined);

        const oneInstanceEndpoints = [];
        for (const profile of profiles) {
            for (const endpoint of profile.communicationEndpoints) {
                if (isOneInstanceEndpoint(endpoint)) {
                    oneInstanceEndpoints.push(endpoint);
                }
            }
        }
        return oneInstanceEndpoints;
    }

    /**
     * Get instance endpoints from all contacts.
     */
    public async findAllOneInstanceEndpointsForOthers(): Promise<OneInstanceEndpoint[]> {
        const others = await this.others();
        const eps = await Promise.all(others.map(LeuteModel.findAllOneInstanceEndpointsForSomeone));
        return eps.reduce((acc, curr) => acc.concat(curr), []);
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

    /**
     * Get all instance endpoints.
     *
     * Iterate over all endpoints and only getting the one instance endpoints.
     *
     * @param someone
     * @private
     */
    private static async findAllOneInstanceEndpointsForSomeone(
        someone: SomeoneModel
    ): Promise<OneInstanceEndpoint[]> {
        const profiles = await someone.profiles();

        const oneInstanceEndpoints = [];
        for (const profile of profiles) {
            for (const endpoint of profile.communicationEndpoints) {
                if (isOneInstanceEndpoint(endpoint)) {
                    oneInstanceEndpoints.push(endpoint);
                }
            }
        }
        return oneInstanceEndpoints;
    }
}

// ######## private functions ########

/**
 * Load the latest version of a profile.
 */
async function loadLeute(): Promise<VersionedObjectResult<Leute>> {
    const idHash = await calculateIdHashOfObj({$type$: 'Leute', appId: 'one.leute'});
    return getObjectByIdHash(idHash);
}

/**
 * Create a people object if it does not exist.
 *
 * @returns The latest version of the profile or an empty profile.
 * @param me
 */
async function createLeute(me: SHA256IdHash<Someone>): Promise<VersionedObjectResult<Leute>> {
    return saveLeute(me, new Set());
}

/**
 * Save a profile with the specified data.
 *
 * @param me
 * @param others
 * @param baseLeuteVersion - the base profile version that is used to calculate the diff for the
 *                             crdt.
 */
async function saveLeute(
    me: SHA256IdHash<Someone>,
    others: Set<SHA256IdHash<Someone>>,
    baseLeuteVersion?: SHA256Hash<Leute>
): Promise<VersionedObjectResult<Leute>> {
    // Create the new version of the people object
    return createSingleObjectThroughPurePlan(
        {module: '@module/profileManagerWriteLeute'},
        me,
        others,
        baseLeuteVersion
    );
}

function isOneInstanceEndpoint(
    endpoint: CommunicationEndpointTypes
): endpoint is OneInstanceEndpoint {
    return endpoint.$type$ === 'OneInstanceEndpoint';
}
