import {getInstanceIdHash} from '@refinio/one.core/lib/instance';
import {
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType
} from '@refinio/one.core/lib/storage';
import {VERSION_UPDATES} from '@refinio/one.core/lib/storage-base-common';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import {OEvent} from '../misc/OEvent';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {LocalInstancesList} from '../recipes/InstancesRecipies';
import type {Instance, Keys, Person} from '@refinio/one.core/lib/recipes';
import {Model} from './Model';
import {instanceCryptoApi} from '@refinio/one.core/lib/keychain/keychain';
import type {CryptoApi} from '@refinio/one.core/lib/crypto/CryptoApi';

/**
 * This type stores information about an instance.
 */
export type LocalInstanceInfo = {
    isMain: boolean;
    personId: SHA256IdHash<Person>; // Id of person
    instanceId: SHA256IdHash<Instance>; // Id of corresponding local instance
    instanceKeys: Keys; // Keys of corresponding local instance
    cryptoApi: CryptoApi; // Crypto api
};

/**
 * This model manages all of the instance objects.
 *
 * At the moment it focuses on managing all local instance.
 * A local instance is an instance object that was created locally, so has private keys.
 * Usually each identity of myself should have exactly one local instance.
 *
 * The methods can be grouped into multiple categories:
 * - query information about all local instances at once
 *   -> localInstances* Methods
 * - query information about a specific local instance (based on instance id)
 *   -> localInstance*
 * - query information about a specific local instance (based on person id)
 *   -> localInstance*ForPerson methods
 * - query information about the main local instance (the local instance whose owner is the main id)
 *   -> mainInstance* methods
 * - add new local instances
 *   -> the rest
 *
 * The * is mostly one of those:
 * - <nothing>: Returns instance object(s)
 * - Id: Returns instance hash id(s)
 * - Keys: Returns Key object(s)
 * - Info: Returns LocalInstanceInfo object(s)
 */
class InstancesModel extends Model {
    /**
     * Event emitted when a local instance is created.
     */
    public onInstanceCreated = new OEvent<(instance: SHA256IdHash<Instance>) => void>();

    private secret: string = '';

    constructor() {
        super();
    }

    /**
     * Initialize this model.
     *
     * @param secret - The secret used to manage the private instance keys. Note that
     * this is bad. The key management shouldn't handle different keys on the same instance
     * differently, then we wouldn't have to do such a thing as storing the secret ... but
     * someday we will do it right ... yes we can ...
     */
    public async init(secret: string): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        // Init must be triggered here, the init function of this model uses his own function in
        // order to get initialised
        this.state.triggerEvent('init');
        this.secret = secret;

        // Create the top level LocalInstancesList if it does not exist
        // Note: Using exceptions for normal program flow is a bad habit
        //       But atm I don't know how to query whether an object exists
        //       without raising an exception, so here it goes.
        try {
            await InstancesModel.localInstanceList();
        } catch (e) {
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'LocalInstancesList',
                    id: 'LocalInstancesList',
                    instances: [{instance: await this.mainInstanceId()}]
                }
            );
        }
    }

    /**
     * Shutdown the model
     */
    public async shutdown() {
        this.state.triggerEvent('shutdown');
    }

    // ######## Generic query methods for all local instances ########

    /**
     * Returns all instance objects that represent your local instance.
     *
     * @param exclude_main
     * @param localInstancesList
     * @returns
     */
    public async localInstances(
        exclude_main: boolean = false,
        localInstancesList?: LocalInstancesList
    ): Promise<Instance[]> {
        this.state.assertCurrentState('Initialised');

        const instanceIdHashes = await this.localInstancesIds(exclude_main);
        const instanceResults = await Promise.all(
            instanceIdHashes.map(hash => getObjectByIdHash(hash))
        );
        return instanceResults.map(result => result.obj);
    }

    /**
     * Returns all ids of instance objects that represent your local instance.
     *
     * @param exclude_main
     * @param localInstancesList
     * @returns
     */
    public async localInstancesIds(
        exclude_main: boolean = false,
        localInstancesList?: LocalInstancesList
    ): Promise<SHA256IdHash<Instance>[]> {
        this.state.assertCurrentState('Initialised');

        // Obtain the local instances list if not supplied.
        if (!localInstancesList) {
            localInstancesList = await InstancesModel.localInstanceList();
        }

        // Extract the instance member (id hash of instance) of each list entry
        const instanceIds = localInstancesList.instances.map(instance => instance.instance);

        // Return the whole list or the whole list excluding the main instance
        if (exclude_main) {
            const mainInstanceId = await this.mainInstanceId();
            return instanceIds.filter(instanceId => instanceId != mainInstanceId);
        } else {
            return instanceIds;
        }
    }

    /**
     * Returns a list of info objects for all local instances.
     *
     * @param exclude_main
     * @param localInstancesList
     * @returns
     */
    public async localInstancesInfo(
        exclude_main: boolean = false,
        localInstancesList?: LocalInstancesList
    ): Promise<LocalInstanceInfo[]> {
        this.state.assertCurrentState('Initialised');

        const ids = await this.localInstancesIds();
        return Promise.all(ids.map(id => this.localInstanceInfo(id)));
    }

    // ######## Instance query methods for main instance ########

    /**
     * Returns your main instance object.
     *
     * @returns
     */
    public async mainInstance(): Promise<Instance> {
        this.state.assertCurrentState('Initialised');

        return (await getObjectByIdHash(await this.mainInstanceId())).obj;
    }

    /**
     * Returns the id of your main instance.
     *
     * @returns
     */
    public async mainInstanceId(): Promise<SHA256IdHash<Instance>> {
        // this.state.assertCurrentState('Initialised');

        const idHash = await getInstanceIdHash();
        if (!idHash) {
            throw new Error('There is no instance id hash.');
        }
        return idHash;
    }

    /**
     * Get the main instance keys.
     *
     * @returns
     */
    public async mainInstanceKeys(): Promise<Keys> {
        this.state.assertCurrentState('Initialised');

        return this.localInstanceKeys(await this.mainInstanceId());
    }

    /**
     * Returns multiple information of your main instance.
     *
     * @returns
     */
    public async mainInstanceInfo(): Promise<LocalInstanceInfo> {
        this.state.assertCurrentState('Initialised');

        return this.localInstanceInfo(await this.mainInstanceId());
    }

    // ######## Instance query methods based on instance ID ########

    /**
     * @param instanceId
     * @returns
     */
    public async localInstance(instanceId: SHA256IdHash<Instance>): Promise<Instance> {
        this.state.assertCurrentState('Initialised');

        if (!(await this.isLocalInstance(instanceId))) {
            throw new Error('Passed instance is not a local instance');
        }
        return (await getObjectByIdHash(instanceId)).obj;
    }

    /**
     * Get the instance keys for a specific person.
     *
     * @param instanceId
     * @returns
     */
    public async localInstanceKeys(instanceId: SHA256IdHash<Instance>): Promise<Keys> {
        this.state.assertCurrentState('Initialised');

        return await getObjectWithType(await this.localInstanceKeysHash(instanceId), 'Keys');
    }

    /**
     * Get the instance key hash for a specific person.
     *
     * @param instanceId
     * @returns
     */
    public async localInstanceKeysHash(
        instanceId: SHA256IdHash<Instance>
    ): Promise<SHA256Hash<Keys>> {
        this.state.assertCurrentState('Initialised');

        if (!(await this.isLocalInstance(instanceId))) {
            throw new Error('Passed instance is not a local instance');
        }
        const instanceKeyLink = await getAllEntries(instanceId, 'Keys');
        return instanceKeyLink[instanceKeyLink.length - 1];
    }

    /**
     * Obtain the instance info for a certain locale instance.
     *
     * @param instanceId
     * @returns
     */
    public async localInstanceInfo(instanceId: SHA256IdHash<Instance>): Promise<LocalInstanceInfo> {
        this.state.assertCurrentState('Initialised');

        if (!(await this.isLocalInstance(instanceId))) {
            throw new Error('Passed instance is not a local instance');
        }
        const instance = await getObjectByIdHash(instanceId);
        const instanceKeys = await this.localInstanceKeys(instanceId);
        const cryptoApi = await instanceCryptoApi(instanceId);
        return {
            isMain: instanceId === (await this.mainInstanceId()),
            personId: instance.obj.owner,
            instanceId,
            instanceKeys,
            cryptoApi
        };
    }

    /**
     * Checks whether the instance is local.
     *
     * @param instanceId
     * @returns
     */
    public async isLocalInstance(instanceId: SHA256IdHash<Instance>): Promise<boolean> {
        this.state.assertCurrentState('Initialised');

        const list = await this.localInstancesIds();
        return list.find(instances => instances === instanceId) !== undefined;
    }

    // ######## Instance query method based on Person ID ########

    /**
     * Get the local instance for a specific person.
     *
     * @param personId
     * @returns
     */
    public async localInstanceForPerson(personId: SHA256IdHash<Person>): Promise<Instance> {
        this.state.assertCurrentState('Initialised');

        const localInstance = await this.localInstances();
        const instance = localInstance.find(instance => instance.owner === personId);
        if (!instance) {
            throw new Error('No local instance for the specified person id');
        }
        return instance;
    }

    /**
     * Get the local instance id hash for a specific person.
     *
     * @param personId
     * @returns
     */
    public async localInstanceIdForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256IdHash<Instance>> {
        this.state.assertCurrentState('Initialised');

        const instanceIdHashes = await this.localInstancesIds();
        const instanceResults = await Promise.all(
            instanceIdHashes.map(hash => getObjectByIdHash(hash))
        );
        const instanceResult = instanceResults.find(instance => instance.obj.owner === personId);
        if (!instanceResult) {
            throw new Error('No local instance for the specified person id');
        }
        return instanceResult.idHash;
    }

    /**
     * Get the instance keys for a specific person.
     *
     * @param personId
     * @returns
     */
    public async localInstanceKeysForPerson(personId: SHA256IdHash<Person>): Promise<Keys> {
        this.state.assertCurrentState('Initialised');

        return await this.localInstanceKeys(await this.localInstanceIdForPerson(personId));
    }

    /**
     * Get the instance info related to the local info of the passed person
     *
     * @param personId
     * @returns
     */
    public async localInstanceInfoForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<LocalInstanceInfo> {
        this.state.assertCurrentState('Initialised');

        return await this.localInstanceInfo(await this.localInstanceIdForPerson(personId));
    }

    /**
     * Check whether a person has a local instance object.
     *
     * @param personId
     * @returns
     */
    public async hasPersonLocalInstance(personId: SHA256IdHash<Person>): Promise<boolean> {
        this.state.assertCurrentState('Initialised');

        const instanceIdHashes = await this.localInstancesIds();
        const instanceResults = await Promise.all(
            instanceIdHashes.map(hash => getObjectByIdHash(hash))
        );
        const instanceResult = instanceResults.find(instance => instance.obj.owner === personId);
        return instanceResult !== undefined;
    }

    // ######## Modify local instances list / create ... ########

    /**
     * Creates a local instance for the specified owner.
     *
     * @param owner
     * @returns
     */
    public async createLocalInstance(owner: SHA256IdHash<Person>): Promise<SHA256IdHash<Instance>> {
        this.state.assertCurrentState('Initialised');

        const person = await getObjectByIdHash(owner);
        const instance = await this.createLocalInstanceByEMail(person.obj.email);
        this.onInstanceCreated.emit(instance);
        return instance;
    }

    /**
     * Creates a local instance for the owner with email.
     *
     * The difference between this and createLocalInstance is, that if the person does not exist,
     * then it will be generated with additional person keys. (It just forwards everything to
     * @one/instance-creator. This is only a workaround for now).
     *
     * This also registers the instance in a list that stores whether an instance is local.
     *
     * @param email
     */
    public async createLocalInstanceByEMail(email: string): Promise<SHA256IdHash<Instance>> {
        this.state.assertCurrentState('Initialised');

        // Check that the person does not yet have a instance
        const personId = await calculateIdHashOfObj({
            $type$: 'Person',
            email
        });

        // If an instance already exists, don't create one, just return the existing one
        if (await this.hasPersonLocalInstance(personId)) {
            return this.localInstanceIdForPerson(personId);
        }

        // Create instance with a random name
        const randomInstanceName = await createRandomString(64);
        const instanceIdHash = (
            await createSingleObjectThroughImpurePlan(
                {module: '@one/instance-creator'},
                {
                    name: randomInstanceName,
                    email: email
                }
            )
        ).idHash;

        // Add it to the local instances list
        await this.markInstanceAsLocal(instanceIdHash);
        return instanceIdHash;
    }

    /**
     * Marks the passed instance as local.
     *
     * This fails, if an instance with the same owner already is marked as local.
     *
     * @param instanceId
     */
    public async markInstanceAsLocal(instanceId: SHA256IdHash<Instance>): Promise<void> {
        this.state.assertCurrentState('Initialised');

        await serializeWithType('InstancesModel', async () => {
            // Obtain the local instances list
            const localInstancesList = await InstancesModel.localInstanceList();
            const localInstancesIds = await this.localInstancesIds(false, localInstancesList);

            // Check whether the passed instances owner has already a local instance
            for (const localInstanceId of localInstancesIds) {
                if (localInstanceId === instanceId) {
                    throw new Error('A local instance already exists for this owner');
                }
            }

            // Add the passed instance to the list
            localInstancesList.instances.push({
                instance: instanceId
            });

            // Write the new version
            // I know using @one/identity is bad
            // And I know I could just use the write storage api directly ... but I do not know
            // how atm and I need a fast solution
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                localInstancesList
            );
        });
    }

    // ######## Private API ########

    /**
     * Obtain the local instance list.
     *
     * @returns
     */
    private static async localInstanceList(): Promise<LocalInstancesList> {
        return (
            await getObjectByIdObj({
                $type$: 'LocalInstancesList',
                id: 'LocalInstancesList'
            })
        ).obj;
    }
}

export default InstancesModel;
