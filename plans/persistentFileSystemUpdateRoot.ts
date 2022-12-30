/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import type {UnversionedObjectResult, WriteStorageApi} from '@refinio/one.core/lib/storage';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {
    PersistentFileSystemDirectory,
    PersistentFileSystemRoot
} from '../src/recipes/PersistentFileSystemRecipes';

/**
 * @description Pure plan for updating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @param outdatedRoot
 * @param updatedRootDirectoryHash
 * @returns {Promise<VersionedObjectResult<PersistentFileSystemRoot>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    outdatedRoot: PersistentFileSystemRoot,
    updatedRootDirectoryHash: SHA256Hash<PersistentFileSystemDirectory>
): Promise<UnversionedObjectResult<PersistentFileSystemRoot>> {
    outdatedRoot.root.entry = updatedRootDirectoryHash;
    return await WriteStorage.storeUnversionedObject(outdatedRoot);
}
