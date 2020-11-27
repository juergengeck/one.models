/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {FileSystemDirectory, FileSystemRoot, SHA256Hash} from '@OneCoreTypes';
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
    outdatedRoot: FileSystemRoot,
    updatedRootDirectoryHash: SHA256Hash<FileSystemDirectory>
): Promise<UnversionedObjectResult<FileSystemRoot>> {
    outdatedRoot.content.root = updatedRootDirectoryHash;
    return await WriteStorage.storeUnversionedObject(outdatedRoot)
}
