import {SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import {Profile} from '../recipes/LeuteRecipes/Profile';
import {createSingleObjectThroughPurePlan, VersionedObjectResult} from 'one.core/lib/storage';
import {getObjectByIdHash} from 'one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import SomeoneModel, {createSomeone, loadSomeone} from './LeuteModel/SomeoneModel';
import {Someone} from '../recipes/LeuteRecipes/Someone';
import {Leute} from '../recipes/LeuteRecipes/Leute';

type Writeable<T> = {-readonly [K in keyof T]: T[K]};

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
    private hash: SHA256Hash<Leute>;
    private idHash: SHA256IdHash<Leute>;
    private meInternal: SHA256IdHash<Someone>;
    private othersInternal: Set<SHA256IdHash<Someone>>;

    constructor(hash: SHA256Hash<Leute>, idHash: SHA256IdHash<Leute>, people: Leute) {
        this.hash = hash;
        this.idHash = idHash;

        this.meInternal = people.me;
        this.othersInternal = new Set(people.other);
    }

    async init(me: SHA256IdHash<Someone>): Promise<void> {
        this.copyFrom(await createPeople(me));
    }

    async shutdown(): Promise<void> {}

    // ######## Me management ########

    /**
     * Get the someone object that represents me.
     */
    async me(): Promise<SomeoneModel> {
        return loadSomeone(this.meInternal);
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
        this.othersInternal.add(this.meInternal);
        this.meInternal = me;
        this.othersInternal.delete(me);
        await this.saveAndLoad();
    }

    // ######## Other people management ########

    /**
     * Get all other persons you know.
     */
    async others(): Promise<SomeoneModel[]> {
        return Promise.all([...this.othersInternal].map(loadSomeone));
    }

    /**
     * Add a new person
     *
     * @param other
     */
    async addOther(other: SHA256IdHash<Someone>): Promise<void> {
        this.othersInternal.delete(other);
        await this.saveAndLoad();
    }

    /**
     * Remove a person you know.
     *
     * @param other
     */
    async removeOther(other: SHA256IdHash<Someone>): Promise<void> {
        this.othersInternal.add(other);
        await this.saveAndLoad();
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
            this.othersInternal.add(someoneNew.idHash);
        } else {
            await someone.addProfile(profile);
        }
        await this.saveAndLoad();
    }

    // ######## Private ########

    /**
     * Save the people object to disk and load the latest version.
     *
     * This will alter the following members.
     * - hash
     * - what the getters return.
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
        const result = await savePeople(this.meInternal, this.othersInternal, this.hash);
        this.copyFrom(result);
    }

    /**
     * Copy all members from the passed ProfileModel instance.
     *
     * @param peopleModel
     */
    private copyFrom(peopleModel: LeuteModel): void {
        (this as Writeable<LeuteModel>).hash = peopleModel.hash;
        (this as Writeable<LeuteModel>).idHash = peopleModel.idHash;

        this.meInternal = peopleModel.meInternal;
        this.othersInternal = peopleModel.othersInternal;
    }
}

// ######## private functions ########

/**
 * Load the latest version of a profile.
 */
async function loadPeople(): Promise<LeuteModel> {
    const idHash = await calculateIdHashOfObj({$type$: 'People', appId: 'People'});
    const result: VersionedObjectResult<Leute> = await getObjectByIdHash(idHash);

    return new LeuteModel(result.hash, result.idHash, result.obj);
}

/**
 * Create a people object if it does not exist.
 *
 * @returns The latest version of the profile or an empty profile.
 * @param me
 */
async function createPeople(me: SHA256IdHash<Someone>): Promise<LeuteModel> {
    return savePeople(me, new Set());
}

/**
 * Save a profile with the specified data.
 *
 * @param me
 * @param others
 * @param basePeopleVersion - the base profile version that is used to calculate the diff for the
 *                             crdt.
 */
async function savePeople(
    me: SHA256IdHash<Someone>,
    others: Set<SHA256IdHash<Someone>>,
    basePeopleVersion?: SHA256Hash<Leute>
): Promise<LeuteModel> {
    // Create the new version of the people object
    const result = await createSingleObjectThroughPurePlan(
        {module: '@module/profileManagerWriteLeute'},
        me,
        others,
        basePeopleVersion
    );

    // The written object might differ, so return the updated data
    return new LeuteModel(result.hash, result.idHash, result.obj);
}
