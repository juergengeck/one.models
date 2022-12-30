/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import type {UnversionedObjectResult, WriteStorageApi} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../src/recipes/BlobRecipes';

/**
 * @description Pure plan for updating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @param content
 * @param name
 * @param type
 * @returns {Promise<UnversionedObjectResult<BlobDescriptor>>}
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
    } as const;

    return await WriteStorage.storeUnversionedObject(blobDescriptor);
}
