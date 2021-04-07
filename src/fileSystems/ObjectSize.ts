import {platform} from 'one.core/lib/system/platform';
import {HashTypes, SHA256Hash} from '@OneCoreTypes';
import {getInstanceIdHash} from 'one.core/lib/instance';
import {createError} from 'one.core/lib/errors';
import {FS_ERRORS} from './FSErrors';

/**
 * Read the object's file size
 * @param {SHA256Hash<HashTypes>} hash
 * @returns {Promise<number>}
 */
export async function getObjectSize(hash: SHA256Hash<HashTypes>): Promise<number> {
    if (platform === 'node') {
        const {default: fs} = await import('fs');
        const path = `${process.cwd()}/data/${getInstanceIdHash()}/objects/${hash}`;
        const stat = fs.statSync(path);
        return stat.size;
    }

    throw createError('FSE-OBJS', {message: FS_ERRORS['FSE-OBJS'].message});
}
