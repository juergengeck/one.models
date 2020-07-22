import {Instance, SHA256IdHash, LocalInstancesList, Person, Keys} from '@OneCoreTypes';
import {getInstanceIdHash} from 'one.core/lib/instance';
import {
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType
} from 'one.core/lib/storage';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {serializeWithType} from 'one.core/lib/util/promise';
import {authenticateOwner, loadInstanceKeys} from 'one.core/lib/instance-crypto';
import {EventEmitter} from 'events';

/**
 * This model manages all of the instance objects of everybody.
 */
class InstancesModel extends EventEmitter {
    private secret: string = '';

    /**
     * Initialize this model.
     *
     * @param {string} secret - The secret used to manae the private instance keys. Note that this is bad.
     *                          The key management shouldn't handle different keys on the same instance
     *                          differently, then we wouldn't have to do such a thing as storing the secret ...
     *                          but someday we will do it right ... yes we can ...
     * @returns {Promise<void>}
     */
    public async init(secret: string): Promise<void> {
        this.secret = secret;

        // Create the top level LocalInstancesList if it does not exist
        // Note: Using exceptions for normal program flow is a bad habit
        //       But atm I don't know how to query whether an object exists
        //       without raising an exception, so here it goes.
        try {
            await this.localInstanceList();
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

        // Authenticate owner and local instance for private keys
        await Promise.all(
            (await this.localInstancesIds(true)).map(async instanceId => {
                const instance = await getObjectByIdHash(instanceId);
                await authenticateOwner(this.secret, instance.obj.owner, instanceId);
                await loadInstanceKeys(this.secret, instanceId);
            })
        );
    }

    /**
     * Returns your main instance object.
     *
     * @returns {Promise<Instance>}
     */
    public async mainInstance(): Promise<Instance> {
        return (await getObjectByIdHash(await this.mainInstanceId())).obj;
    }

    /**
     * Returns the id of your main instance.
     *
     * @returns {Promise<SHA256IdHash<Instance>>}
     */
    public async mainInstanceId(): Promise<SHA256IdHash<Instance>> {
        const idHash = await getInstanceIdHash();
        if (!idHash) {
            throw new Error('There is no instance id hash.');
        }
        return idHash;
    }

    /**
     * Returns all instance objects that represent your local instance.
     *
     * @param {boolean} exclude_main
     * @param {LocalInstancesList} localInstancesList
     * @returns {Promise<Instance[]>}
     */
    public async localInstances(
        exclude_main: boolean = false,
        localInstancesList?: LocalInstancesList
    ): Promise<Instance[]> {
        const instanceIdHashes = await this.localInstancesIds(exclude_main);
        const instanceResults = await Promise.all(
            instanceIdHashes.map(hash => getObjectByIdHash(hash))
        );
        return instanceResults.map(result => result.obj);
    }

    /**
     * Returns all ids of instance objects that represent your local instance.
     *
     * @param {boolean} exclude_main
     * @param {LocalInstancesList} localInstancesList
     * @returns {Promise<SHA256IdHash<Instance>[]>}
     */
    public async localInstancesIds(
        exclude_main: boolean = false,
        localInstancesList?: LocalInstancesList
    ): Promise<SHA256IdHash<Instance>[]> {
        // Obtain the local instances list if not supplied.
        if (!localInstancesList) {
            localInstancesList = await this.localInstanceList();
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
     * Get the local instance for a specific person.
     *
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Instance>}
     */
    public async localInstanceForPerson(personId: SHA256IdHash<Person>): Promise<Instance> {
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
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Instance>}
     */
    public async localInstanceIdForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<SHA256IdHash<Instance>> {
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
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Keys>}
     */
    public async instanceKeysForPerson(personId: SHA256IdHash<Person>): Promise<Keys> {
        return await this.instanceKeys(await this.localInstanceIdForPerson(personId));
    }

    /**
     * Get the instance keys for a specific person.
     *
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<Keys>}
     */
    public async instanceKeys(instanceId: SHA256IdHash<Instance>): Promise<Keys> {
        const instanceKeyLink = await getAllValues(instanceId, true, 'Keys');
        return await getObjectWithType(instanceKeyLink[instanceKeyLink.length - 1].toHash, 'Keys');
    }

    /**
     * Check whether a person has a local instance object.
     *
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<boolean>}
     */
    public async hasPersonLocalInstance(personId: SHA256IdHash<Person>): Promise<boolean> {
        const instanceIdHashes = await this.localInstancesIds();
        const instanceResults = await Promise.all(
            instanceIdHashes.map(hash => getObjectByIdHash(hash))
        );
        const instanceResult = instanceResults.find(instance => instance.obj.owner === personId);
        return instanceResult !== undefined;
    }

    /**
     * Creates a local instance for the specified owner.
     *
     * @param {SHA256IdHash<Person>} owner
     * @returns {Promise<void>}
     */
    public async createLocalInstance(owner: SHA256IdHash<Person>): Promise<SHA256IdHash<Instance>> {
        const person = await getObjectByIdHash(owner);
        const instance = await this.createLocalInstanceByEMail(person.obj.email);
        this.emit('instance_created', instance);
        return instance;
    }

    /**
     * Creates a local instance for the owner with email.
     *
     * The difference between this and createLocalInstance is, that if the person does not exist,
     * then it will be generated with additional person keys. (It just forwards everything to
     * @one/instance-creator. This is only a workaround for now).
     *
     * @param {string} email
     * @returns {Promise<void>}
     */
    public async createLocalInstanceByEMail(email: string): Promise<SHA256IdHash<Instance>> {
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
                    email: email,
                    secret: this.secret
                }
            )
        ).idHash;

        // Authenticate owner - this also should be done somewhere else ... someday
        await authenticateOwner(this.secret, personId, instanceIdHash);
        await loadInstanceKeys(this.secret, instanceIdHash);

        // Add it to the local instances list
        await this.markInstanceAsLocal(instanceIdHash);
        return instanceIdHash;
    }

    /**
     * Marks the passed instance as local.
     *
     * This fails, if an instance with the same owner already is marked as local.
     *
     * @param {SHA256IdHash<Instance>} instanceId
     * @returns {Promise<void>}
     */
    public async markInstanceAsLocal(instanceId: SHA256IdHash<Instance>): Promise<void> {
        await serializeWithType('InstancesModel', async () => {
            // Obtain the local instances list
            const localInstancesList = await this.localInstanceList();
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
     * @returns {Promise<LocalInstancesList>}
     */
    private async localInstanceList(): Promise<LocalInstancesList> {
        return (
            await getObjectByIdObj({
                $type$: 'LocalInstancesList',
                id: 'LocalInstancesList'
            })
        ).obj;
    }
}

export default InstancesModel;
