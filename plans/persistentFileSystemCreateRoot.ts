/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {PersistentFileSystemDirectoryEntry, PersistentFileSystemRoot } from '@OneCoreTypes';
import {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';

/**
 * @description Pure plan for creating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi
): Promise<UnversionedObjectResult<PersistentFileSystemRoot>> {
    const root = await WriteStorage.storeUnversionedObject({
        $type$: 'PersistentFileSystemDirectory',
        children: new Map<string, PersistentFileSystemDirectoryEntry>()
    });

    return await WriteStorage.storeUnversionedObject({
        $type$: 'PersistentFileSystemRoot',
        root: {
            mode: 0o0040777,
            entry: root.hash
        }
    })
}
