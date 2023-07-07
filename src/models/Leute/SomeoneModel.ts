import {storeVersionedObjectCRDT} from '@refinio/one.core/lib/crdt';
import type {Person} from '@refinio/one.core/lib/recipes';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {VersionedObjectResult} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    getIdObject,
    getObjectByIdHash,
    onVersionedObj
} from '@refinio/one.core/lib/storage-versioned-objects';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {OEvent} from '../../misc/OEvent';
import type {
    CommunicationEndpointInterfaces,
    CommunicationEndpointTypeNames
} from '../../recipes/Leute/CommunicationEndpoints';
import type {
    PersonDescriptionInterfaces,
    PersonDescriptionTypeNames
} from '../../recipes/Leute/PersonDescriptions';
import type {Profile} from '../../recipes/Leute/Profile';
import type {Someone} from '../../recipes/Leute/Someone';
import ProfileModel from './ProfileModel';

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

        // try catch is not required if we have CRDT map support
        try {
            return await this.constructFromLatestVersion(idHash);
        } catch (_) {
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

    /**
     * Sets the main identity by guessing which profile to use as mainProfile
     *
     * @param identity
     */
    public async setMainIdentity(identity: SHA256IdHash<Person>): Promise<void> {
        if (this.someone === undefined) {
            throw new Error('Nothing was loaded, yet');
        }

        const mainIdentity = await this.mainIdentity();

        if (identity === mainIdentity) {
            return;
        }

        if (!this.pIdentities.has(identity)) {
            throw new Error(
                'The designated new main identity is not managed by this someone object'
            );
        }

        const profiles = await this.profiles(identity);

        if (profiles.length === 0) {
            throw new Error('We have no profiles to assign as main profile :-(');
        }

        // FIRST CHOICE: A 'default' profile that is owned by the person itself
        const firstChoice = profiles.find(
            profile => profile.profileId === 'default' && profile.owner === identity
        );

        if (firstChoice !== undefined) {
            this.someone.mainProfile = firstChoice.idHash;
            await this.saveAndLoad();
            return;
        }

        // SECOND CHOICE: Another 'default' profile
        for (const profile of profiles) {
            if (profile.profileId === 'default') {
                this.someone.mainProfile = profile.idHash;
                await this.saveAndLoad();
                return;
            }
        }

        // THIRD CHOICE: Any other profile
        this.someone.mainProfile = profiles[0].idHash;
        await this.saveAndLoad();
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

    /**
     * Set the main profile.
     *
     * Throws if the identity referenced by this profile is not managed by this someone object.
     *
     * @param profile
     */
    public async setMainProfile(profile: SHA256IdHash<Profile>): Promise<void> {
        if (this.pMainProfile === undefined) {
            throw new Error('SomeoneModel has no data (mainProfile)');
        }

        const profileObj = await getIdObject(profile);
        const profileSet = this.pIdentities.get(profileObj.personId);

        if (profileSet === undefined) {
            throw new Error(
                'This someone object does not manage the identity of the passed profile.'
            );
        }

        this.pMainProfile = profile;
        if (this.someone) {
            this.someone.mainProfile = profile;
        }

        profileSet.add(profile);
        await this.saveAndLoad();
    }

    /**
     * Set the main profile only when the saved profile is not the main profile.
     *
     * Throws if the identity referenced by this profile is not managed by this someone object.
     *
     * @param profile
     */
    public async setMainProfileIfNotDefault(profile: SHA256IdHash<Profile>): Promise<void> {
        if (this.pMainProfile === undefined) {
            throw new Error('SomeoneModel has no data (mainProfile)');
        }

        const profileObj = await getIdObject(profile);
        const profileSet = this.pIdentities.get(profileObj.personId);

        if (profileSet === undefined) {
            throw new Error(
                'This someone object does not manage the identity of the passed profile.'
            );
        }

        const mainProfileObj = await getIdObject(this.pMainProfile);

        if (mainProfileObj.profileId === 'default') {
            return;
        }

        if (profileObj.profileId !== 'default') {
            return;
        }

        this.pMainProfile = profile;
        if (this.someone) {
            this.someone.mainProfile = profile;
        }

        profileSet.add(profile);
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
    ): Promise<ProfileModel> {
        const profile = await ProfileModel.constructWithNewProfile(personId, owner, profileId);
        await this.addProfile(profile.idHash);
        return profile;
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

        try {
            console.log('SomeoneModel.saveAndLoad 1', this.idHash, this.pLoadedVersion);
            const result = await storeVersionedObjectCRDT(
                {
                    $type$: 'Someone',
                    someoneId: this.someone.someoneId,
                    mainProfile: this.someone.mainProfile,
                    identity: identities
                },
                this.pLoadedVersion
            );
            console.log('SomeoneModel.saveAndLoad 2', this.idHash, this.pLoadedVersion, result);

            await this.updateModelDataFromSomeone(result.obj, result.hash);
        } catch (e) {
            console.log('SomeoneModel.saveAndLoad Error', this.idHash, this.pLoadedVersion, e);
            throw e;
        }
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

    public async getMainProfileDisplayName(): Promise<string> {
        try {
            const profile = await this.mainProfile();
            const personNames = profile.descriptionsOfType('PersonName');
            if (personNames.length === 0) {
                return 'undefined';
            }
            return personNames[0].name;
        } catch (_) {
            return 'undefined';
        }
    }

    public async getDefaultProfileDisplayNames(): Promise<Map<SHA256IdHash<Person>, string>> {
        const map = new Map<SHA256IdHash<Person>, string>();

        if (this.someone === undefined) {
            return map;
        }

        for (const identity of this.someone.identity) {
            const name = await this.getDefaultProfileDisplayNameFromProfiles(identity.profile);
            if (name !== undefined) {
                map.set(identity.person, name);
            }
        }

        return map;
    }

    /**
     * Get the profile name from one of the default profiles.
     *
     * It will first try to find the profile that we edited (I am owner).
     * Then it will try to find the profile that the person itself edited (He is owner)
     * Then it will look for a default profile from any owner.
     *
     * @param identity
     */
    public async getDefaultProfileDisplayName(identity: SHA256IdHash<Person>): Promise<string> {
        if (this.someone === undefined) {
            return identity;
        }

        const identityData = this.someone.identity.find(i => i.person === identity);
        if (identityData === undefined) {
            return identity;
        }

        const name = await this.getDefaultProfileDisplayNameFromProfiles(identityData.profile);

        return name === undefined ? identity : name;
    }

    private async getDefaultProfileDisplayNameFromProfiles(
        profileHashes: SHA256IdHash<Profile>[]
    ): Promise<string | undefined> {
        try {
            const profileIdObjs = await Promise.all(
                profileHashes.map(idHash => getIdObject<Profile>(idHash))
            );
            const defaultProfileIdObjs = profileIdObjs.filter(
                profile => profile.profileId === 'default'
            );
            const defaultProfiles = await Promise.all(
                defaultProfileIdObjs.map(async idObj =>
                    ProfileModel.constructFromLatestVersionByIdFields(
                        idObj.personId,
                        idObj.owner,
                        idObj.profileId
                    )
                )
            );

            const myId = await this.mainIdentity();
            const meOwner = SomeoneModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                profile => profile.owner === myId
            );
            if (meOwner !== undefined) {
                return meOwner;
            }

            const selfOwner = SomeoneModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                profile => profile.owner === profile.personId
            );
            if (selfOwner !== undefined) {
                return selfOwner;
            }

            const anyOwner = SomeoneModel.getPersonNameFromFilteredProfiles(
                defaultProfiles,
                _profile => true
            );
            if (anyOwner !== undefined) {
                return anyOwner;
            }

            return undefined;
        } catch (_) {
            return undefined;
        }
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

    /**
     * Get the person name from the first profile that matches the predicate.
     *
     * @param profiles
     * @param predicate
     * @private
     */
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
}
