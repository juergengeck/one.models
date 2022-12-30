/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import type {UnversionedObjectResult, WriteStorageApi} from '@refinio/one.core/lib/storage';
import type {PersistentFileSystemRoot} from '../src/recipes/PersistentFileSystemRecipes';

/**
 * @description Pure plan for creating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @returns {Promise<UnversionedObjectResult<PersistentFileSystemRoot>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi
): Promise<UnversionedObjectResult<PersistentFileSystemRoot>> {
    const root = await WriteStorage.storeUnversionedObject({
        $type$: 'PersistentFileSystemDirectory',
        children: []
    });

    return await WriteStorage.storeUnversionedObject({
        $type$: 'PersistentFileSystemRoot',
        root: {
            mode: 0o0040777,
            entry: root.hash
        }
    });
}
