/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    BLOB,
    PersistentFileSystemDirectory,
    PersistentFileSystemRoot,
    SHA256Hash,
    BlobDescriptor,
    BlobCollection
} from '@OneCoreTypes';
import {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import {FileCreation} from "one.core/src/storage";

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
    content: ArrayBuffer,
    name: string,
    type: string
): Promise<UnversionedObjectResult<BlobDescriptor>> {
    const blobDescriptor = {
        $type$: 'BlobDescriptor',
        data: (await WriteStorage.storeArrayBufferAsBlob(content)).hash,
        lastModified: Date.now(),
        name: name,
        size: content.byteLength,
        type: type
    }

    return await WriteStorage.storeUnversionedObject(blobDescriptor);
}
