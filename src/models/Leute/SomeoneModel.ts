import ProfileModel from './ProfileModel';
import type {Profile} from '../../recipes/Leute/Profile';
import {getObject, onVersionedObj, VersionedObjectResult} from '@refinio/one.core/lib/storage';
import {getObjectByIdHash} from '@refinio/one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import type {Someone} from '../../recipes/Leute/Someone';
import {OEvent} from '../../misc/OEvent';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import type {
    CommunicationEndpointInterfaces,
    CommunicationEndpointTypeNames
} from '../../recipes/Leute/CommunicationEndpoints';
import type {
    PersonDescriptionInterfaces,
    PersonDescriptionTypeNames
} from '../../recipes/Leute/PersonDescriptions';
import {storeVersionedObjectCRDT} from '@refinio/one.core/lib/crdt';

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
    public onUpdate: OEvent<() => void> = new OEvent();

    public readonly idHash: SHA256IdHash<Someone>;

    private pMainProfile?: SHA256IdHash<Profile>;
    private pIdentities: Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>;
    private pLoadedVersion?: SHA256Hash<Someone>;
    private someone?: Someone;

    constructor(idHash: SHA256IdHash<Someone>) {
        this.idHash = idHash;
        this.pIdentities = new Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>();

        // Setup the onUpdate event
        const emitUpdateIfMatch = (result: VersionedObjectResult) => {
            if (result.idHash === this.idHash) {
                this.onUpdate.emit();
            }
        };
        this.onUpdate.onListen(() => {
            if (this.onUpdate.listenerCount() === 0) {
                onVersionedObj.addListener(emitUpdateIfMatch);
            }
        });
        this.onUpdate.onStopListen(() => {
            if (this.onUpdate.listenerCount() === 0) {
                onVersionedObj.removeListener(emitUpdateIfMatch);
            }
        });
    }

    // ######## asynchronous constructors ########

    /**
     * Construct a new SomeoneModel with a specific version loaded.
     */
    public static async constructFromVersion(version: SHA256Hash<Someone>): Promise<SomeoneModel> {
        const someone = await getObject(version);
        const idHash = await calculateIdHashOfObj(someone);
        const newModel = new SomeoneModel(idHash);
        await newModel.updateModelDataFromSomeone(someone, version);
        return newModel;
    }

    /**
     * Construct a new SomeoneModel with the latest version loaded.
     */
    public static async constructFromLatestVersion(
        idHash: SHA256IdHash<Someone>
    ): Promise<SomeoneModel> {
        const newModel = new SomeoneModel(idHash);
        await newModel.loadLatestVersion();
        return newModel;
    }

    /**
     * Create a someone if it does not exist.
     *
     * If you specify descriptions and / or endpoints here and a someone version already exists
     * without those endpoints and / or descriptions it will add them again.
     *
     * @param someoneId
     * @param mainProfile
     * @returns The latest version of the someone or an empty someone.
     */
    public static async constructWithNewSomeone(
        someoneId: string,
        mainProfile: SHA256IdHash<Profile>
    ): Promise<SomeoneModel> {
        const newSomeone: Someone = {
            $type$: 'Someone',
            someoneId,
            mainProfile,
            identity: []
        };
        const idHash = await calculateIdHashOfObj(newSomeone);

        const newModel = new SomeoneModel(idHash);

        // add mainProfile to identities
        const profile = await getObjectByIdHash(mainProfile);
        const identitySet = new Set<SHA256IdHash<Profile>>();
        identitySet.add(mainProfile);
        newModel.pIdentities.set(profile.obj.personId, identitySet);

        newModel.someone = newSomeone;
        await newModel.saveAndLoad();
        return newModel;
    }

    // ######## Identity management ########

    /**
     * Add an identity to the someone object and save it.
     *
     * @param identity
     */
    public async addIdentity(identity: SHA256IdHash<Person>): Promise<void> {
        if (this.pIdentities.has(identity)) {
            throw new Error('This identity is already managed by this someone object');
        }
        this.pIdentities.set(identity, new Set());
        await this.saveAndLoad();
    }

    /**
     * Remove an identity to the someone object
     *
     * @param identity
     */
    public async removeIdentity(identity: SHA256IdHash<Person>): Promise<void> {
        if (!this.pIdentities.has(identity)) {
            throw new Error('This identity is not managed by this someone object');
        }
        this.pIdentities.delete(identity);
        await this.saveAndLoad();
    }

    /**
     * Get all identities managed by this someone object.
     */
    public identities(): SHA256IdHash<Person>[] {
        return [...this.pIdentities.keys()];
    }

    public async mainIdentity(): Promise<SHA256IdHash<Person>> {
        return (await this.mainProfile()).personId;
    }

    public async alternateIdentities(): Promise<SHA256IdHash<Person>[]> {
        const mainIdentity = await this.mainIdentity();
        return this.identities().filter(id => id !== mainIdentity);
    }

    // ######## Main profile management ########

    public mainProfile(): Promise<ProfileModel> {
        if (this.pMainProfile === undefined) {
            throw new Error('SomeoneModel has no data (mainProfile)');
        }
        return ProfileModel.constructFromLatestVersion(this.pMainProfile);
    }

    public mainProfileLazyLoad(): ProfileModel {
        if (this.pMainProfile === undefined) {
            throw new Error('SomeoneModel has no data (mainProfile)');
        }
        return new ProfileModel(this.pMainProfile);
    }

    // ######## Profile management ########

    /**
     * Get the profiles managed by this someone object.
     *
     * @param identity
     */
    public async profiles(identity?: SHA256IdHash<Person>): Promise<ProfileModel[]> {
        const profiles = this.profilesLazyLoad(identity);
        await Promise.all(profiles.map(profile => profile.loadLatestVersion()));
        return profiles;
    }

    /**
     * Get the profiles managed by this someone object.
     *
     * Note that this will return ProfileModel instances that have no data in them. You have to use
     * loadLatestVersion on it in order to get the data.
     *
     * @param identity - Get the profiles only for this identity. If not specified, get all profiles
     *                   for all identities managed by this someone object.
     */
    public profilesLazyLoad(identity?: SHA256IdHash<Person>): ProfileModel[] {
        const profileHashes = [];

        // Collect all SHA256IdHash<Profile> hashes for the picked identities (or all)
        if (identity === undefined) {
            for (const profiles of this.pIdentities.values()) {
                profileHashes.push(...profiles);
            }
        } else {
            const profiles = this.pIdentities.get(identity);
            if (profiles === undefined) {
                throw new Error('This identity is not managed by this someone object');
            }
            profileHashes.push(...profiles);
        }

        // Load all profile objects
        return profileHashes.map(profileIdHash => new ProfileModel(profileIdHash));
    }

    /**
     * Add a profile to this someone object.
     */
    public async addProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        const profileObj = await getObjectByIdHash(profile);
        const profileSet = this.pIdentities.get(profileObj.obj.personId);

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
    public async createProfile(
        profileId: string,
        personId: SHA256IdHash<Person>,
        owner: SHA256IdHash<Person>
    ): Promise<void> {
        const profile = await ProfileModel.constructWithNewProfile(personId, owner, profileId);
        await this.addProfile(profile.idHash);
    }

    // ######## Save & Load ########

    /**
     * Returns whether this model has data loaded.
     *
     * If this returns false, then the 'hash', 'profileId' ... properties will throw when being
     * accessed.
     */
    public hasData(): boolean {
        return this.someone !== undefined;
    }

    /**
     * Load a specific someone version.
     *
     * @param version
     */
    public async loadVersion(version: SHA256Hash<Someone>): Promise<void> {
        const someone = await getObject(version);

        const idHash = await calculateIdHashOfObj(someone);
        if (idHash !== this.idHash) {
            throw new Error('Specified someone version is not a version of the managed someone');
        }

        await this.updateModelDataFromSomeone(someone, version);
    }

    /**
     * Load the latest someone version.
     */
    public async loadLatestVersion(): Promise<void> {
        const result = await getObjectByIdHash(this.idHash);

        await this.updateModelDataFromSomeone(result.obj, result.hash);
    }

    /**
     * Save the someone to disk and load the latest version.
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
    public async saveAndLoad(): Promise<void> {
        if (this.someone === undefined) {
            throw new Error('No someone data that could be saved');
        }

        const identities = [];
        for (const [personId, profileIds] of this.pIdentities.entries()) {
            identities.push({
                person: personId,
                profile: [...profileIds]
            });
        }

        const result = await storeVersionedObjectCRDT(
            {
                $type$: 'Someone',
                someoneId: this.someone.someoneId,
                mainProfile: this.someone.mainProfile,
                identity: identities
            },
            this.pLoadedVersion
        );

        await this.updateModelDataFromSomeone(result.obj, result.hash);
    }

    // ######## misc ########

    /**
     * Return all endpoints from all profiles.
     */
    public async collectAllEndpointsOfType<T extends CommunicationEndpointTypeNames>(
        type: T,
        identity?: SHA256IdHash<Person>
    ): Promise<CommunicationEndpointInterfaces[T][]> {
        const endpoints = [];
        for (const profile of await this.profiles(identity)) {
            endpoints.push(...profile.endpointsOfType(type));
        }
        return endpoints;
    }

    /**
     * Return all descriptions from all profiles.
     */
    public async collectAllDescriptionsOfType<T extends PersonDescriptionTypeNames>(
        type: T,
        identity?: SHA256IdHash<Person>
    ): Promise<PersonDescriptionInterfaces[T][]> {
        const descriptions = [];
        for (const profile of await this.profiles(identity)) {
            descriptions.push(...profile.descriptionsOfType(type));
        }
        return descriptions;
    }

    // ######## private stuff ########

    /**
     * Updates the members of the model based on a loaded profile and the version hash.
     *
     * @param someone
     * @param version
     * @private
     */
    private async updateModelDataFromSomeone(
        someone: Someone,
        version: SHA256Hash<Someone>
    ): Promise<void> {
        const identities = new Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>();

        for (const identity of someone.identity) {
            identities.set(identity.person, new Set(identity.profile));
        }

        this.pIdentities = identities;
        this.pMainProfile = someone.mainProfile;
        this.pLoadedVersion = version;
        this.someone = someone;
    }
}
