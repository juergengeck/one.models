import {Person, SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import {Profile} from '../../recipes/PeopleRecipes/Profile';
import {CommunicationEndpointTypes} from '../../recipes/PeopleRecipes/CommunicationEndpoints';
import {ContactDescriptionTypes} from '../../recipes/PeopleRecipes/PersonDescriptions';
import {getObjectByIdHash} from 'one.core/lib/storage-versioned-objects';
import {VersionedObjectResult} from 'one.core/lib/storage';
import {getObjectWithType} from 'one.core/lib/storage-unversioned-objects';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

type Writeable<T> = {-readonly [K in keyof T]: T[K]};

/**
 * This class is a nicer frontend for the Profile recipe.
 *
 * A profile describes a persons identity in more detail. What is an identity in one? The identity
 * used throughout ONE is the SHA256IdHash<Person>. The profile glues additional information to such
 * an identity like:
 * - how to contact this person (e-mail, telephone number, address, ...) - called "contact endpoint"
 * - name, pictures ... - called "contact description"
 *
 * Reasons for not using the Profile recipe directly:
 * - Because this is a CRDT tracked type we need to track which version was loaded, so on which
 *   versions the modifications are based on. If we don't store it with the data we need to track it
 *   separately. Perhaps in the future we can find some common solution for all recipes. This is
 *   just the first test if having a separate data structure adds some value to the ui.
 * - The endpoints and descriptions are links to ONE objects. If you want to use the recipe directly
 *   you would have to load them in the ui context asynchronously - which would result in a data
 *   structure very similar to this - so why not do it here directly?
 * - Changes in the recipe can be represented on this level without breaking API changes.
 *
 * There are alternative designs. I just want to try this approach because of the reasons mentioned
 * above. This might be a start on how to represent CRDT managed types - but later in a generic way.
 */
export default class ProfileModel {
    public readonly hash: SHA256Hash<Profile>;
    public readonly idHash: SHA256IdHash<Profile>;
    public readonly personId: SHA256IdHash<Person>;
    public readonly owner: SHA256IdHash<Person>;
    public readonly profileId: string;

    public communicationEndpoints: CommunicationEndpointTypes[] = [];
    public contactDescriptions: ContactDescriptionTypes[] = [];

    /**
     * Construct a new Profile wrapper on a profile identity.
     *
     * Note that this constructor is not intended to be called directly.
     * It is much easier to use one of the module level functions to create a new instance. Why
     * didn't I provide constructors for e.g. constructing a ProfileModel from a Profile id-hash?
     * Because constructors cannot be async and the loading needs to be async.
     *
     * @param hash - The hash of the profile version that was loaded.
     * @param idHash - The id-hash of the profile that this instance manages.
     * @param personId - The person which is described by this instance.
     * @param owner - The owner of this data. This is the person that created the profile. This is
     *                a namespacing mechanism, so that profiles with the same name about the same
     *                person but from different authors are not merged together.
     * @param profileId - An id of the profile so that we can have multiple profiles describing the
     *                    same person.
     */
    constructor(
        hash: SHA256Hash<Profile>,
        idHash: SHA256IdHash<Profile>,
        personId: SHA256IdHash<Person>,
        owner: SHA256IdHash<Person>,
        profileId: string
    ) {
        this.hash = hash;
        this.idHash = idHash;
        this.personId = personId;
        this.owner = owner;
        this.profileId = profileId;
    }

    /**
     * Save the profile to disk and load the latest version.
     *
     * This will alter the following members.
     * - hash
     * - communicationEndpoints
     * - contactDescriptions
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
        const result = await saveProfile(
            this.profileId,
            this.personId,
            this.owner,
            this.communicationEndpoints,
            this.contactDescriptions,
            this.hash
        );

        (this as Writeable<ProfileModel>).hash = result.hash;
        this.communicationEndpoints = result.communicationEndpoints;
        this.contactDescriptions = result.contactDescriptions;
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
    public async load(version?: SHA256Hash<Profile>): Promise<void> {
        const result =
            version === undefined
                ? await loadLatestProfile(this.idHash)
                : await loadProfile(version);
        if (result.idHash !== this.idHash) {
            throw new Error('Specified profile version is not a version of the managed profile');
        }
        (this as Writeable<ProfileModel>).hash = result.hash;
        this.communicationEndpoints = result.communicationEndpoints;
        this.contactDescriptions = result.contactDescriptions;
    }
}

/**
 * Load the latest version of a profile.
 *
 * @param idHash - The id-hash identifying the profile to load.
 */
export async function loadLatestProfile(idHash: SHA256IdHash<Profile>): Promise<ProfileModel> {
    const result: VersionedObjectResult<Profile> = await getObjectByIdHash(idHash);
    const newProfile = new ProfileModel(
        result.hash,
        result.idHash,
        result.obj.personId,
        result.obj.owner,
        result.obj.personId
    );
    newProfile.communicationEndpoints = await Promise.all(
        result.obj.communicationEndpoint.map(ep => getObjectWithType(ep))
    );
    newProfile.contactDescriptions = await Promise.all(
        result.obj.contactDescription.map(ep => getObjectWithType(ep))
    );
    return newProfile;
}

/**
 * Load a specific profile version.
 *
 * @param version
 */
export async function loadProfile(version: SHA256Hash<Profile>): Promise<ProfileModel> {
    const result: Profile = await getObject(version);
    const idHash: SHA256IdHash<Profile> = await calculateIdHashOfObj(result);
    const newProfile = new ProfileModel(
        version,
        idHash,
        result.personId,
        result.owner,
        result.personId
    );
    newProfile.communicationEndpoints = await Promise.all(
        result.communicationEndpoint.map(ep => getObjectWithType(ep))
    );
    newProfile.contactDescriptions = await Promise.all(
        result.contactDescription.map(ep => getObjectWithType(ep))
    );
    return newProfile;
}

/**
 * Create a profile if it does not exist.
 *
 * @param personId
 * @param owner
 * @param profileId
 * @returns The latest version of the profile or an empty profile.
 */
export async function createProfile(
    personId: SHA256IdHash<Person>,
    owner: SHA256IdHash<Person>,
    profileId: string
): Promise<ProfileModel> {
    return saveProfile(profileId, personId, owner, [], []);
}

// ######## private functions ########

/**
 * Save a profile with the specified data.
 *
 * @param profileId - profile id to write
 * @param personId - person id to write
 * @param owner - owner to write
 * @param communicationEndpoints - communication endpoints to write
 * @param contactDescriptions - contact descriptions to write
 * @param baseProfileVersion - the base profile version that is used to calculate the diff for the
 *                             crdt.
 */
async function saveProfile(
    profileId: string,
    personId: SHA256IdHash<Person>,
    owner: SHA256IdHash<Person>,
    communicationEndpoints: CommunicationEndpointTypes[],
    contactDescriptions: ContactDescriptionTypes[],
    baseProfileVersion?: SHA256Hash<Profile>
): Promise<ProfileModel> {
    const result = await createSingleObjectThroughPurePlan(
        {module: '@module/profileManagerWriteProfile'},
        profileId,
        personId,
        owner,
        communicationEndpoints,
        contactDescriptions,
        baseProfileVersion
    );
    const newProfile = new ProfileModel(
        result.hash,
        result.idHash,
        result.obj.personId,
        result.obj.owner,
        result.obj.personId
    );
    newProfile.communicationEndpoints = await Promise.all(
        result.obj.communicationEndpoint.map(ep => getObjectWithType(ep))
    );
    newProfile.contactDescriptions = await Promise.all(
        result.obj.contactDescription.map(ep => getObjectWithType(ep))
    );
    return newProfile;
}
