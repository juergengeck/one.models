import type {UnversionedObjectResult, WriteStorageApi} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../lib/recipes/BlobRecipes';

export async function createObjects(
    WriteStorage: WriteStorageApi,
    file: File
): Promise<UnversionedObjectResult<BlobDescriptor>> {
    const blobs: UnversionedObjectResult<BlobDescriptor>[] = [];

    const stream = WriteStorage.createFileWriteStream();
    stream.write(await file.arrayBuffer());
    const blob = await stream.end();

    const {lastModified, name, size, type} = file;

    const blobDescriptor: BlobDescriptor = {
        $type$: 'BlobDescriptor',
        data: blob.hash,
        lastModified,
        name,
        size,
        type
    };

    return WriteStorage.storeUnversionedObject(blobDescriptor);
}
