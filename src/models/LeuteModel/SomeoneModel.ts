import ProfileModel, {createProfile, loadProfile} from './ProfileModel';
import type {Profile} from '../../recipes/LeuteRecipes/Profile';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    VersionedObjectResult
} from 'one.core/lib/storage';
import {getObjectByIdHash} from 'one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import type {Someone} from '../../recipes/LeuteRecipes/Someone';
import {OEvent} from '../../misc/OEvent';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

type Writeable<T> = {-readonly [K in keyof T]: T[K]};

/**
 * This class is a nicer frontend for the Someone recipe.
 *
 * 'Someone' is a collection of several person identities that belong the the same real person.
 * Someone also collects all the profiles of those identities.
 *
 * Reasons for not using the Someone recipe directly:
 * - Because the whole identity management on the lower levels is pretty complicated. So it is much
 *   nicer for the users to have a nicer interface.
 *
 * TODO: Add convenience function for obtaining the default display name of a someone (from the main
 *       profile)
 */
export default class SomeoneModel {
    public readonly hash: SHA256Hash<Someone>;
    public readonly idHash: SHA256IdHash<Someone>;
    public readonly someoneId: string;

    public onUpdate: OEvent<() => void> = new OEvent();

    private mainProfileInternal: SHA256IdHash<Profile>;
    private identitiesInternal: Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>;

    constructor(hash: SHA256Hash<Someone>, idHash: SHA256IdHash<Someone>, someone: Someone) {
        this.hash = hash;
        this.idHash = idHash;
        this.someoneId = someone.someoneId;
        this.mainProfileInternal = someone.mainProfile;
        this.identitiesInternal = new Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>();

        for (const identity of someone.identity) {
            this.identitiesInternal.set(identity.person, new Set(identity.profile));
        }
    }

    /**
     * Load the latest profile version.
     *
     * Note that loading an object alters the following members:
     * - hash
     * - communicationEndpoints
     * - contactDescriptions
     *
     * @param version - The exact version to load. If not specified, load the latest version.
     */
    public async load(version?: SHA256Hash<Someone>): Promise<void> {
        const result =
            version === undefined
                ? await loadSomeone(this.idHash)
                : await loadSomeoneVersion(version);
        if (result.idHash !== this.idHash) {
            throw new Error('Specified someone version is not a version of the managed someone');
        }
        (this as Writeable<SomeoneModel>).hash = result.hash;
        this.identitiesInternal = result.identitiesInternal;
    }

    // ######## Identity management ########

    /**
     * Add an identity to the someone object and save it.
     *
     * @param identity
     */
    async addIdentity(identity: SHA256IdHash<Person>): Promise<void> {
        if (this.identitiesInternal.has(identity)) {
            throw new Error('This identity is already managed by this someone object');
        }
        this.identitiesInternal.set(identity, new Set());
        await this.saveAndLoad();
    }

    /**
     * Remove an identity to the someone object
     *
     * @param identity
     */
    async removeIdentity(identity: SHA256IdHash<Person>): Promise<void> {
        if (!this.identitiesInternal.has(identity)) {
            throw new Error('This identity is not managed by this someone object');
        }
        this.identitiesInternal.delete(identity);
        await this.saveAndLoad();
    }

    /**
     * Get all identities managed by this someone object.
     */
    identities(): SHA256IdHash<Person>[] {
        return [...this.identitiesInternal.keys()];
    }

    async mainIdentity(): Promise<SHA256IdHash<Person>> {
        return (await this.mainProfile()).personId;
    }

    async alternateIdentities(): Promise<SHA256IdHash<Person>[]> {
        const mainIdentity = await this.mainIdentity();
        return this.identities().filter(id => id !== mainIdentity);
    }

    // ######## Main profile management ########

    async mainProfile(): Promise<ProfileModel> {
        return loadProfile(this.mainProfileInternal);
    }

    // ######## Profile management ########

    /**
     * Get the profiles managed by this someone object.
     *
     * TODO: Lazy loading. This function loads all profiles with all endpoints. This is a lot of
     *       objects. This prevents a fast rendering of the ui. We could load the profiles without
     *       the endpoints and the ui decides when to get them. Or we could do the whole thing
     *       event driven.
     *
     * @param identity - Get the profiles only for this identity. If not specified, get all profiles
     *                   for all identities managed by this someone object.
     */
    async profiles(identity?: SHA256IdHash<Person>): Promise<ProfileModel[]> {
        const profileHashes = [];

        // Collect all SHA256IdHash<Profile> hashes for the picked identities (or all)
        if (identity === undefined) {
            for (const profiles of this.identitiesInternal.values()) {
                profileHashes.push(...profiles);
            }
        } else {
            const profiles = this.identitiesInternal.get(identity);
            if (profiles === undefined) {
                throw new Error('This identity is not managed by this someone object');
            }
            profileHashes.push(...profiles);
        }

        // Load all profile objects
        return Promise.all(profileHashes.map(loadProfile));
    }

    /**
     * Add a profile to this someone object.
     */
    async addProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        const profileObj = await getObjectByIdHash(profile);
        const profileSet = this.identitiesInternal.get(profileObj.obj.personId);

        if (profileSet === undefined) {
            throw new Error('The someone object does not manage profiles for the specified person');
        }

        profileSet.add(profile);
        await this.saveAndLoad();
    }

    /**
     * Create a new profile for a specific person.
     *
     * @param profileId
     * @param personId
     * @param owner
     */
    async createProfile(
        profileId: string,
        personId: SHA256IdHash<Person>,
        owner: SHA256IdHash<Person>
    ): Promise<void> {
        const profile = await createProfile(personId, owner, profileId);
        await this.addProfile(profile.idHash);
    }

    // ######## Private ########

    /**
     * Save the someone object to disk and load the latest version.
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
        const result = await saveSomeone(
            this.someoneId,
            this.mainProfileInternal,
            this.identitiesInternal,
            this.hash
        );

        this.copyFrom(result);
    }

    /**
     * Copy all members from the passed SomeoneModel instance.
     *
     * @param someoneModel
     */
    private copyFrom(someoneModel: SomeoneModel) {
        (this as Writeable<SomeoneModel>).hash = someoneModel.hash;
        (this as Writeable<SomeoneModel>).idHash = someoneModel.idHash;
        (this as Writeable<SomeoneModel>).someoneId = someoneModel.someoneId;

        this.mainProfileInternal = someoneModel.mainProfileInternal;
        this.identitiesInternal = someoneModel.identitiesInternal;
    }
}

/**
 * Load the latest version of a profile.
 *
 * @param idHash - The id-hash identifying the profile to load.
 */
export async function loadSomeone(idHash: SHA256IdHash<Someone>): Promise<SomeoneModel> {
    const result: VersionedObjectResult<Someone> = await getObjectByIdHash(idHash);

    return new SomeoneModel(result.hash, result.idHash, result.obj);
}

/**
 * Load a specific profile version.
 *
 * @param version
 */
export async function loadSomeoneVersion(version: SHA256Hash<Someone>): Promise<SomeoneModel> {
    const result: Someone = await getObject(version);
    const idHash: SHA256IdHash<Someone> = await calculateIdHashOfObj(result);

    return new SomeoneModel(version, idHash, result);
}

/**
 * Create a someone object with a main profile if it does not exist.
 *
 * @returns The latest version of the profile or an empty profile.
 * @param someoneId
 * @param mainProfile
 */
export async function createSomeone(
    someoneId: string,
    mainProfile: SHA256IdHash<Profile>
): Promise<SomeoneModel> {
    const mProfile = await getObjectByIdHash(mainProfile);
    return saveSomeone(
        someoneId,
        mainProfile,
        new Map([[mProfile.obj.personId, new Set([mainProfile])]])
    );
}

// ######## private functions ########

/**
 * Save a profile with the specified data.
 *
 * @param someoneId
 * @param mainProfile
 * @param profiles
 * @param baseSomeoneVersion - the base profile version that is used to calculate the diff for the
 *                             crdt.
 */
async function saveSomeone(
    someoneId: string,
    mainProfile: SHA256IdHash<Profile>,
    profiles: Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>,
    baseSomeoneVersion?: SHA256Hash<Someone>
): Promise<SomeoneModel> {
    // Create the new version of the someone object
    const result = await createSingleObjectThroughPurePlan(
        {module: '@module/profileManagerWriteSomeone'},
        someoneId,
        mainProfile,
        profiles,
        baseSomeoneVersion
    );

    // The written object might differ, so return the updated data
    return new SomeoneModel(result.hash, result.idHash, result.obj);
}
