import type {UnversionedObjectResult, WriteStorageApi} from '@refinio/one.core/lib/storage';
import type {BlobCollection, BlobDescriptor} from '../lib/recipes/BlobRecipes';
import {createSingleObjectThroughPurePlan} from '@refinio/one.core/lib/storage';

export async function createObjects(
    WriteStorage: WriteStorageApi,
    files: File[],
    name: string
): Promise<UnversionedObjectResult<BlobCollection>> {
    const blobs: UnversionedObjectResult<BlobDescriptor>[] = [];

    for (const file of files) {
        const blobDescriptor = (await createSingleObjectThroughPurePlan(
            {module: '@module/writeFile'},
            file
        )) as UnversionedObjectResult<BlobDescriptor>;

        blobs.push(blobDescriptor);
    }

    const blobCollection: BlobCollection = {
        $type$: 'BlobCollection',
        blobs: blobs.map((blobResult: UnversionedObjectResult<BlobDescriptor>) => blobResult.hash),
        name
    };

    return WriteStorage.storeUnversionedObject(blobCollection);
}
