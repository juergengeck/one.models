import {WriteStorageApi} from 'one.core/lib/storage';
import {BlobDescriptor, BlobCollection, UnversionedObjectResult} from '@OneCoreTypes';

export async function createObjects(
    WriteStorage: WriteStorageApi,
    Files: File[],
    name: string
): Promise<UnversionedObjectResult<BlobCollection>> {
    const blobs: UnversionedObjectResult<BlobDescriptor>[] = [];

    for (const file of Files) {
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
        blobs.push(await WriteStorage.storeUnversionedObject(blobDescriptor));
    }

    const blobCollection: BlobCollection = {
        $type$: 'BlobCollection',
        blobs: blobs.map((blobResult: UnversionedObjectResult<BlobDescriptor>) => blobResult.hash),
        name
    };

    return WriteStorage.storeUnversionedObject(blobCollection);
}
