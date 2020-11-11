/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import { FilerDirectory, FilerFile, SHA256Hash } from '@OneCoreTypes';
import {UnversionedObjectResult, WriteStorageApi} from 'one.core/lib/storage';

/**
 * @description Pure plan for creating the root directory
 *
 * @param {WriteStorageApi} WriteStorage
 * @returns {Promise<VersionedObjectResult<ContactApp>>}
 */
export async function createObjects(
    WriteStorage: WriteStorageApi
): Promise<UnversionedObjectResult<FilerDirectory>> {
    return await WriteStorage.storeUnversionedObject({
        $type$: 'FilerDirectory',
        meta: {path: '/', name: '/', mode: 0o0100777},
        children: new Map<string, SHA256Hash<FilerDirectory | FilerFile>>()
    });
}
