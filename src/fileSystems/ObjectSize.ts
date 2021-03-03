import {platform} from "one.core/lib/system/platform";
import {HashTypes, SHA256Hash} from "@OneCoreTypes";
import {getInstanceIdHash} from "one.core/lib/instance";


/**
 * Read the object's file size
 * @param {SHA256Hash<HashTypes>} hash
 * @returns {Promise<number>}
 */
export async function getObjectSize(hash: SHA256Hash<HashTypes>): Promise<number> {
    if(platform === 'node') {
        const {default: fs} = await import('fs');
        const path = `${process.cwd()}/data/${getInstanceIdHash()}/objects/${hash}`;
        const stat = fs.statSync(path);
        return stat.size
    }

    throw new Error('Error: getObjectSize() is not supported on other systems then node.')
}
