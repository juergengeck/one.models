import {WriteStorageApi} from 'one.core/lib/storage';
import {ProfileImage, UnversionedObjectResult} from '@OneCoreTypes';

export async function createObjects(
    WriteStorage: WriteStorageApi,
    image: ArrayBuffer
): Promise<UnversionedObjectResult<ProfileImage>> {
    const stream = WriteStorage.createFileWriteStream();
    console.log("plan modules image: ", image);
    stream.write(image);
    const blob = await stream.end();
    console.log("plan modules blob: ", blob);

    const profileImage: ProfileImage = {
        $type$: 'ProfileImage',
        image: blob.hash
    };

    console.log("plan modules profileImage: ", profileImage);

    return await WriteStorage.storeUnversionedObject(profileImage);
}
