/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {PersistentFileSystemDirectory, PersistentFileSystemRoot, SHA256Hash} from '@OneCoreTypes';
import {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';

/**
 * @description Pure plan for updating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @param outdatedRoot
 * @param updatedRootDirectoryHash
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi,
    outdatedRoot: PersistentFileSystemRoot,
    updatedRootDirectoryHash: SHA256Hash<PersistentFileSystemDirectory>
): Promise<UnversionedObjectResult<PersistentFileSystemRoot>> {
    outdatedRoot.root.entry = updatedRootDirectoryHash;
    return await WriteStorage.storeUnversionedObject(outdatedRoot)
}
