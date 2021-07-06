import {Person, SHA256Hash, SHA256IdHash} from '@OneCoreTypes';
import {Profile} from '../../recipes/PeopleRecipes/Profile';
import {CommunicationEndpointTypes} from '../../recipes/PeopleRecipes/CommunicationEndpoints';
import {ContactDescriptionTypes} from '../../recipes/PeopleRecipes/PersonDescriptions';
import {getObjectByIdHash} from 'one.core/lib/storage-versioned-objects';
import {VersionedObjectResult} from 'one.core/src/storage';
import {getObjectWithType} from 'one.core/lib/storage-unversioned-objects';
import {getObject} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

/**
 *
 * A profile describes an identity in more detail than just the id (which is a hash).
 *
 * The profile glues additional information to an identity like how to contact the person behind
 * this identity or describing information like names / images ...
 *
 * This class is a nicer frontend for the Profile recipe.
 *
 * Why was this design as class chosen?
 *
 * Reasons for not using the Profile recipe directly:
 * Reason1: Because this is a CRDT tracked type we need to track which version was loaded, so on
 *          which versions the modifications are based on. If we don't store it with the data we
 *          need to track it separately. Perhaps in the future we can find some common solution for
 *          all recipes. This is just the first test if having a separate data strucutre adds some
 *          value to the ui.
 * Reason2: The endpoints and descriptions are links to one objects. If you want to use the recipe
 *          directly you would have to load them in the ui context asynchronously - which would
 *          result in a data structure very similar to this - so why not do it here directly?
 * Reason3: Changes in the recipe can be represented on this level without breaking API changes.
 *
 * Reasons for class with methods vs. load / save functions that get the data type passed along:
 * Reason1: Under the assumption that all the PeopleModel stuff is implemented in a single file.
 *          The class adds another conceptual scope, so you know you have those two / three methods
 *          to influence the profile. If those are module functions and you also have the someone
 *          and application functions there you have to study the API in more detail to see what you
 *          can do with the Profile.
 * Reason2: If we support multiple one instances to be opened at the same time in the same process
 *          (which I would strongly suggest for the future (testability, migration ...)), then the
 *          one instance connection has to be stored somewhere. You don't want to pass it into each
 *          call, because the UI should not have to deal with such internals like which connection
 *          to use ... You can't store it as module local variable, because then this module won't
 *          work with multiple connections.
 *
 * There are alternative designs. I just want to try this approach because of the reasons mentioned
 * above. This might be a start on how to represent CRDT managed types - but later in a generic way.
 */
export default class ProfileModel {
    private _hash?: SHA256Hash<Profile>;
    private readonly _idHash: SHA256IdHash<Profile>;
    private _personId?: SHA256IdHash<Person>;
    private _profileId?: string;

    get hash(): SHA256Hash<Profile> {
        if (this._hash === undefined) {
            throw new Error('No profile loaded.');
        }
        return this._hash;
    }

    get personId(): SHA256IdHash<Person> {
        if (this._personId === undefined) {
            throw new Error('No profile loaded.');
        }
        return this._personId;
    }

    get profileId(): string {
        if (this._profileId === undefined) {
            throw new Error('No profile loaded.');
        }
        return this._profileId;
    }

    get idHash(): SHA256IdHash<Profile> {
        return this._idHash;
    }

    communicationEndpoints: CommunicationEndpointTypes[] = [];
    contactDescriptions: ContactDescriptionTypes[] = [];

    /**
     * Construct a new Profile wrapper on a profile identity.
     *
     * @param profileId
     */
    constructor(profileId: SHA256IdHash<Profile>) {
        this._idHash = profileId;
    }

    save() {}

    /**
     * Load the latest profile version.
     */
    async loadLatest(): Promise<void> {
        const result: VersionedObjectResult<Profile> = await getObjectByIdHash(this._idHash);
        this._hash = result.hash;
        this._personId = result.obj.personId;
        this._profileId = result.obj.profileId;
        this.communicationEndpoints = await Promise.all(
            result.obj.communicationEndpoint.map(ep => getObjectWithType(ep))
        );
        this.contactDescriptions = await Promise.all(
            result.obj.contactDescription.map(ep => getObjectWithType(ep))
        );
    }

    /**
     * Load a specific profile version.
     */
    async loadSpecific(version: SHA256Hash<Profile>): Promise<void> {
        const result: Profile = await getObject(version);
        const idHash: SHA256IdHash<Profile> = await calculateIdHashOfObj(result);
        if (idHash !== this._idHash) {
            throw new Error(
                'The loaded version is not a version of the profile id managed by this profile model.'
            );
        }

        this._hash = version;
        this._personId = result.personId;
        this._profileId = result.profileId;
        this.communicationEndpoints = await Promise.all(
            result.communicationEndpoint.map(ep => getObjectWithType(ep))
        );
        this.contactDescriptions = await Promise.all(
            result.contactDescription.map(ep => getObjectWithType(ep))
        );
    }
}
