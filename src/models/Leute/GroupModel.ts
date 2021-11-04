import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {BLOB, Group, Person} from 'one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {
    getObject,
    onVersionedObj,
    readBlobAsArrayBuffer,
    VersionedObjectResult
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import type {GroupProfile} from '../../recipes/Leute/GroupProfile';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {getObjectByIdHash, storeVersionedObject} from 'one.core/lib/storage-versioned-objects';
import type {Plan} from 'one.core/lib/recipes';
import {storeVersionedObjectCRDT} from 'one.core/lib/crdt';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {Model} from '../Model';

const DUMMY_PLAN_HASH: SHA256Hash<Plan> =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;
// Todo: This is a hack, because CRDT objects don't support optionals
const DUMMY_BLOB_HASH: SHA256Hash<BLOB> =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<BLOB>;

export default class GroupModel extends Model {
    public readonly groupIdHash: SHA256IdHash<Group>;
    public readonly profileIdHash: SHA256IdHash<GroupProfile>;

    public name: string = 'unnamed group';
    public picture?: ArrayBuffer;
    public persons: SHA256IdHash<Person>[] = [];

    private pLoadedVersion?: SHA256Hash<GroupProfile>;
    private group?: Group;
    private profile?: GroupProfile;

    constructor(groupIdHash: SHA256IdHash<Group>, profileIdHash: SHA256IdHash<GroupProfile>) {
        super();
        this.profileIdHash = profileIdHash;
        this.groupIdHash = groupIdHash;

        // Setup the onUpdate event
        const emitUpdateIfMatch = (result: VersionedObjectResult) => {
            if (result.idHash === this.groupIdHash || result.idHash === this.profileIdHash) {
                this.onUpdated.emit();
            }
        };
        this.onUpdated.onListen(() => {
            if (this.onUpdated.listenerCount() === 0) {
                onVersionedObj.addListener(emitUpdateIfMatch);
            }
        });
        this.onUpdated.onStopListen(() => {
            if (this.onUpdated.listenerCount() === 0) {
                onVersionedObj.removeListener(emitUpdateIfMatch);
            }
        });

        this.state.assertCurrentState('Uninitialised');
        this.state.triggerEvent('init');
    }

    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        this.state.triggerEvent('shutdown');
    }

    // ######## asynchronous constructors ########

    /**
     * Construct a new GroupModel with a specific version loaded.
     */
    public static async constructFromProfileVersion(
        version: SHA256Hash<GroupProfile>
    ): Promise<GroupModel> {
        const profile = await getObject(version);
        const profileIdHash = await calculateIdHashOfObj(profile);
        const group = await getObjectByIdHash(profile.group);
        const newModel = new GroupModel(profile.group, profileIdHash);
        await newModel.updateModelDataFromGroupAndProfile(group.obj, profile, version);
        return newModel;
    }

    /**
     * Construct a new GroupModel with the latest version loaded.
     */
    public static async constructFromLatestProfileVersion(
        groupIdHash: SHA256IdHash<Group>
    ): Promise<GroupModel> {
        const profileIdHash = await calculateIdHashOfObj({
            $type$: 'GroupProfile',
            group: groupIdHash
        });
        const newModel = new GroupModel(groupIdHash, profileIdHash);
        await newModel.loadLatestVersion();
        return newModel;
    }

    /**
     * Construct from internal group name.
     *
     * Internal group name is the name parameter of the Group object.
     *
     * @param groupName
     */
    public static async constructFromLoadedVersionByName(groupName: string) {
        const groupIdHash = await calculateIdHashOfObj({
            $type$: 'Group',
            name: groupName,
            person: []
        });
        const profileIdHash = await calculateIdHashOfObj({
            $type$: 'GroupProfile',
            group: groupIdHash
        });

        const loadedModel = new GroupModel(groupIdHash, profileIdHash);
        await loadedModel.loadLatestVersion();
        return loadedModel;
    }

    /**
     * Create a group and profile if they do not exist.
     *
     * @param groupName - Name if not given the internal name will be random, and the profile name will be 'unnamed group'
     * @returns The latest version of the group or an empty group.
     */
    public static async constructWithNewGroup(groupName?: string): Promise<GroupModel> {
        const newGroup: Group = {
            $type$: 'Group',
            name: groupName || (await createRandomString(32)),
            person: []
        };
        const groupResult = await storeVersionedObject(newGroup, DUMMY_PLAN_HASH);

        const newGroupProfile: GroupProfile = {
            $type$: 'GroupProfile',
            group: groupResult.idHash,
            name: groupName || 'unnamed group',
            picture: DUMMY_BLOB_HASH
        };
        const groupProfileResult = await storeVersionedObjectCRDT(
            newGroupProfile,
            undefined,
            DUMMY_PLAN_HASH
        );

        const newModel = new GroupModel(groupResult.idHash, groupProfileResult.idHash);
        await newModel.loadLatestVersion();
        return newModel;
    }

    // ######## getter ########

    /**
     * Returns the profile version that was loaded.
     */
    get loadedVersion(): SHA256Hash<GroupProfile> | undefined {
        this.state.assertCurrentState('Initialised');

        return this.pLoadedVersion;
    }

    /**
     * Returns the name of the loaded Group object.
     *
     * @throws if nothing was loaded
     */
    get internalGroupName(): string {
        this.state.assertCurrentState('Initialised');

        if (this.group === undefined) {
            throw new Error('GroupModel has no data (internalGroupName)');
        }
        return this.group.name;
    }

    // ######## Save & Load ########

    /**
     * Returns whether this model has data loaded.
     *
     * If this returns false, then the 'internalGroupName' property will throw and group members list and name and
     * picture will be empty / undefined.
     */
    public hasData(): boolean {
        this.state.assertCurrentState('Initialised');

        return this.profile !== undefined;
    }

    /**
     * Load a specific profile version.
     *
     * @param version
     */
    public async loadVersion(version: SHA256Hash<GroupProfile>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const profile = await getObject(version);
        const group = await getObjectByIdHash(profile.group);

        const profileIdHash = await calculateIdHashOfObj(profile);
        if (profileIdHash !== this.profileIdHash) {
            throw new Error('Specified profile version is not a version of the managed profile');
        }

        await this.updateModelDataFromGroupAndProfile(group.obj, profile, version);
    }

    /**
     * Load the latest profile version.
     */
    public async loadLatestVersion(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const groupResult = await getObjectByIdHash(this.groupIdHash);
        const profileResult = await getObjectByIdHash(this.profileIdHash);

        await this.updateModelDataFromGroupAndProfile(
            groupResult.obj,
            profileResult.obj,
            profileResult.hash
        );
    }

    /**
     * Save the profile to disk and load the latest version.
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
        this.state.assertCurrentState('Initialised');

        if (this.group === undefined || this.profile === undefined) {
            throw new Error('No profile data that could be saved');
        }

        // Write image blob
        let blobHash: SHA256Hash<BLOB> = DUMMY_BLOB_HASH;
        if (this.picture) {
            const stream = createFileWriteStream();
            stream.write(this.picture);
            blobHash = (await stream.end()).hash;
        }

        // Write the new profile version
        const profileResult = await storeVersionedObjectCRDT(
            {
                $type$: 'GroupProfile',
                group: this.groupIdHash,
                name: this.name,
                picture: blobHash
            },
            this.pLoadedVersion,
            DUMMY_PLAN_HASH
        );

        const groupResult = await storeVersionedObject(
            {
                $type$: 'Group',
                name: this.internalGroupName,
                person: this.persons
            },
            DUMMY_PLAN_HASH
        );

        await this.updateModelDataFromGroupAndProfile(
            groupResult.obj,
            profileResult.obj,
            profileResult.hash
        );
        this.onUpdated.emit();
    }

    // ######## private stuff ########

    /**
     * Updates the members of the model based on a loaded profile and the version hash.
     *
     * @param group
     * @param profile
     * @param version
     * @private
     */
    private async updateModelDataFromGroupAndProfile(
        group: Group,
        profile: GroupProfile,
        version: SHA256Hash<GroupProfile>
    ): Promise<void> {
        this.name = profile.name;
        this.picture =
            profile.picture !== DUMMY_BLOB_HASH
                ? await readBlobAsArrayBuffer(profile.picture)
                : undefined;
        this.persons = group.person;
        this.profile = profile;
        this.group = group;
        this.pLoadedVersion = version;
    }
}
