import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import {getObject, getObjectByIdObj, UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import type {
    OneObjectInterfaces,
    OneObjectTypeNames,
    OneObjectTypes,
    OneUnversionedObjectTypes,
    OneVersionedObjectTypes,
    Plan
} from '@refinio/one.core/lib/recipes';
import type {MetaObjectMap} from '../recipes/MetaObjectMapRecipes';
import {storeVersionedObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {iterateArrayFromEnd} from '@refinio/one.core/lib/util/function';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';

const DUMMY_PLAN_HASH: SHA256Hash<Plan> =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

/**
 * Add a meta object to the list of meta objects.
 *
 * @param objHash - THe object for which the MetaObjectMap should be altered.
 * @param metaObjectHash - The hash of the meta object.
 */
export async function addMetaObject(
    objHash: SHA256Hash,
    metaObjectHash: SHA256Hash
): Promise<void> {
    const metaObject = await getObject(metaObjectHash);
    await addMetaObjectWithType(objHash, metaObjectHash, metaObject.$type$);
}

/**
 * Store the passed object and add it to the MetaObjectMap.
 *
 * @param objHash - THe object for which the MetaObjectMap should be altered.
 * @param metaObject - The meta object.
 */
export async function storeMetaObject<T extends OneUnversionedObjectTypes>(
    objHash: SHA256Hash,
    metaObject: T
): Promise<UnversionedObjectResult<T>> {
    const metaObjectResult = await storeUnversionedObject(metaObject);
    await addMetaObjectWithType(objHash, metaObjectResult.hash, metaObject.$type$);
    return metaObjectResult;
}

/**
 * Get the meta objects of a specific type.
 *
 * @param objHash
 * @param type
 */
export async function getMetaObjectsOfType<T extends OneObjectTypeNames>(
    objHash: SHA256Hash,
    type: T
): Promise<OneObjectInterfaces[T][]> {
    const metaObjectHashes = await getMetaObjectHashesOfType(objHash, type);
    const metaObjects = await Promise.all(metaObjectHashes.map(getObject));

    // Filter unwanted objects, so that the app does not die if a wrong object made it into the map.
    // This is just a stability improvement.
    const metaObjectsOfType: OneObjectInterfaces[T][] = metaObjects.filter(
        (obj: OneObjectTypes): obj is OneObjectInterfaces[T] => {
            return obj.$type$ === type;
        }
    );
    if (metaObjectHashes.length !== metaObjectsOfType.length) {
        console.error('Programming Error: Somehow an object of the wrong type made it into the MetaObjectMap');
    }

    return metaObjectsOfType;
}

/**
 * Get the meta object hashes of a specific type.
 *
 * @param objHash
 * @param type
 */
export async function getMetaObjectHashesOfType<T extends OneObjectTypeNames>(
    objHash: SHA256Hash,
    type: T
): Promise<SHA256Hash<OneObjectInterfaces[T]>[]> {
    const metaObjectMap = await loadMetaObjectMap(objHash);
    let metaObjectHashes = metaObjectMap.metaObjects.get(type);
    if (metaObjectHashes === undefined) {
        return [];
    }
    return metaObjectHashes as SHA256Hash<OneObjectInterfaces[T]>[];
}

/**
 * Get the latest meta object of a specific type.
 *
 * @param objHash
 * @param type
 */
export async function getLatestMetaObjectOfType<T extends OneObjectTypeNames>(
    objHash: SHA256Hash,
    type: T
): Promise<OneObjectInterfaces[T]> {
    const metaObjectMap = await loadMetaObjectMap(objHash);
    let metaObjectHashes = metaObjectMap.metaObjects.get(type);
    if (metaObjectHashes === undefined) {
        throw new Error('No meta object of type found (1)');
    }

    function isObjectOfType(obj: OneObjectTypes): obj is OneObjectInterfaces[T] {
        return obj.$type$ === type;
    }

    // We filter all objects by type, even though the map-entry should only contain objects of the right type.
    // This is just for stability - if somebody manages to put something else in there.
    for (const metaObject of iterateArrayFromEnd(metaObjectHashes)) {
        // eslint-disable-next-line no-await-in-loop
        const metaObj = await getObject(metaObject);

        // This should always be true, but if somebody somehow smuggled a wrong typed object
        // into the data structure we do another loop
        if (isObjectOfType(metaObj)) {
            return metaObj;
        }
    }

    throw new Error('No meta object of type found (2)');
}

// ######## Private stuff ########

/**
 * Add an element to the MetaObjectMap.
 *
 * Attention: The type must be the type of the object with the metaObjectHash. Otherwise the map will be wrong.
 *
 * @param objHash - THe object for which the MetaObjectMap should be altered.
 * @param metaObjectHash - The hash of the meta object.
 * @param type - The type of the metaObject with the hash metaObjectHash.
 */
async function addMetaObjectWithType(
    objHash: SHA256Hash,
    metaObjectHash: SHA256Hash,
    type: OneObjectTypeNames
): Promise<void> {
    return serializeWithType(`MetaObjectMap_${objHash}`, async () => {
        const metaObjectMap = await loadMetaObjectMap(objHash);

        // Add metaObject to the list with the correct type
        let metaObjectHashes = metaObjectMap.metaObjects.get(type);
        if (metaObjectHashes !== undefined) {
            metaObjectHashes.push(metaObjectHash);
        } else {
            metaObjectMap.metaObjects.set(type, [metaObjectHash]);
        }

        await saveMetaObjectMap(metaObjectMap);
    });
}

/**
 * Loads the MetaObjectMap for the given hash.
 *
 * If the MetaObjectMap does not exist, it will return an empty MetaObjectList.
 */
async function loadMetaObjectMap(objHash: SHA256Hash): Promise<MetaObjectMap> {
    try {
        return (
            await getObjectByIdObj({
                $type$: 'MetaObjectMap',
                object: objHash
            })
        ).obj;
    } catch (ignore) {
        return {
            $type$: 'MetaObjectMap',
            object: objHash,
            metaObjects: new Map()
        };
    }
}

/**
 * Create a new version of the metaObjectMap
 *
 * @param metaObjectMap
 */
async function saveMetaObjectMap(metaObjectMap: MetaObjectMap) {
    await storeVersionedObject(metaObjectMap, DUMMY_PLAN_HASH);
}
