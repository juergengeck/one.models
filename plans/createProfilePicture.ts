import type {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';
import type {ProfileImage} from '../lib/recipes/LeuteRecipes/PersonDescriptions';

export async function createObjects(
    WriteStorage: WriteStorageApi,
    image: ArrayBuffer
): Promise<UnversionedObjectResult<ProfileImage>> {
    const stream = WriteStorage.createFileWriteStream();
    stream.write(image);
    const blob = await stream.end();

    const profileImage: ProfileImage = {
        $type$: 'ProfileImage',
        image: blob.hash
    };

    return await WriteStorage.storeUnversionedObject(profileImage);
}
