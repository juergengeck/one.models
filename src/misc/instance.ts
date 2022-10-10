import type {Instance, Keys, Person} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {getAllIdObjectEntries} from '@refinio/one.core/lib/reverse-map-query';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {storeVersionedObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    createDefaultKeys,
    getDefaultKeys,
    hasDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';

/**
 * Get the instance object representing this instance / device.
 *
 * This is the instance object for which we have a complete keypair.
 *
 * @param owner - The owner of the instance
 */
export async function getLocalInstanceOfPerson(
    owner: SHA256IdHash<Person>
): Promise<SHA256IdHash<Instance>> {
    const localInstances = (await getInstancesOfPerson(owner))
        .filter(i => i.local)
        .map(i => i.instanceId);
    if (localInstances.length < 0) {
        throw new Error('There are no local instances for that person');
    } else if (localInstances.length > 1) {
        throw new Error('There are multiple local instances for that person - that is a bug');
    }

    return localInstances[0];
}

/**
 * Get all instances that represent remote instances / devices.
 *
 * These are all instance objects for which we don't have a complete keypair (because they weren't
 * created on this device)
 *
 * @param owner - The owner of the instance
 */
export async function getRemoteInstancesForPerson(
    owner: SHA256IdHash<Person>
): Promise<Array<SHA256IdHash<Instance>>> {
    return (await getInstancesOfPerson(owner)).filter(i => !i.local).map(i => i.instanceId);
}

/**
 * Get all instance objects owned by a specific person.
 *
 * @param owner - The owner of the instance
 */
export async function getInstancesOfPerson(owner: SHA256IdHash<Person>): Promise<
    Array<{
        instanceId: SHA256IdHash<Instance>;
        local: boolean;
    }>
> {
    const revMapEntries = await getAllIdObjectEntries(owner, 'Instance');

    return Promise.all(
        revMapEntries.map(async instanceId => {
            return {
                instanceId,
                local: await hasDefaultKeys(instanceId)
            };
        })
    );
}

/**
 * Check if we have a local instance object that is owned by this person.
 *
 * @param owner
 */
export async function hasPersonLocalInstance(owner: SHA256IdHash<Person>): Promise<boolean> {
    return (await getInstancesOfPerson(owner)).some(i => i.local);
}

/**
 * Creates a local instance if none already exists.
 *
 * This means that the instance will also have a complete set of keys associated with it.
 * This function will assert that only one local instance for this owner exists.
 *
 * @param owner
 * @param instanceName
 */
export async function createLocalInstanceIfNotExist(
    owner: SHA256IdHash<Person>,
    instanceName?: string
): Promise<{
    instanceId: SHA256IdHash<Instance>;
    instanceKeys: SHA256Hash<Keys>;
    exists: boolean;
}> {
    const localInstances = (await getInstancesOfPerson(owner)).filter(i => i.local);

    // If local instance already exists return its information
    if (localInstances.length > 0) {
        const instanceId = localInstances[0].instanceId;

        return {
            instanceId,
            instanceKeys: await getDefaultKeys(instanceId),
            exists: true
        };
    }

    // Create a new instance
    if (instanceName === undefined) {
        instanceName = await createRandomString(64);
    }

    const instance = await storeVersionedObject({
        $type$: 'Instance',
        name: instanceName,
        owner,
        recipe: [],
        module: [],
        enabledReverseMapTypes: new Map(),
        enabledReverseMapTypesForIdObjects: new Map()
    });

    const keys = await createDefaultKeys(instance.idHash);

    return {
        instanceId: instance.idHash,
        instanceKeys: keys,
        exists: false
    };
}
