/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {FileSystemDirectoryEntry, FileSystemRoot } from '@OneCoreTypes';
import {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';

/**
 * @description Pure plan for creating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi
): Promise<UnversionedObjectResult<FileSystemRoot>> {
    const root = await WriteStorage.storeUnversionedObject({
        $type$: 'FileSystemDirectory',
        children: new Map<string, FileSystemDirectoryEntry>()
    });

    return await WriteStorage.storeUnversionedObject({
        $type$: 'FileSystemRoot',
        content: {
            mode: 0o0100777,
            root: root.hash
        }
    })
}
