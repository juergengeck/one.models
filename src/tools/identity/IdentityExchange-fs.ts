/**
 * This file implements helper functions to generate and import / export identities from / to the file system.
 */
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import {readFile, writeFile} from 'fs/promises';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';

import {existsSync} from 'fs';
import type {OneInstanceEndpoint} from '../../recipes/Leute/CommunicationEndpoints';
import type {Identity, IdentityWithSecrets} from '../../misc/IdentityExchange';
import {
    generateRandomIdentity,
    isIdentity,
    isIdentityWithSecrets,
    loadOneInstanceEndpointAsIdentity,
    storeIdentityAsOneInstanceEndpoint
} from '../../misc/IdentityExchange';

// ######## Identity I/O ########

/**
 * Creates a random identity and writes it to a file.
 *
 * Does not need a running one instance.
 *
 * @param fileNamePrefix - The prefix of the file. ${fileNamePrefix}_secret.id.json is the identity with secret keys,
 *                         ${fileNamePrefix}.id.json is the identity only with public keys.
 * @param commServerUrl - The communication server url to include in the identity file.
 */
export async function writeRandomIdentityToFile(
    fileNamePrefix: string,
    commServerUrl: string
): Promise<{
    secret: IdentityWithSecrets;
    public: Identity;
    secretFileName: string;
    publicFileName: string;
}> {
    const identity = await generateRandomIdentity(commServerUrl);
    const secretFileName = fileNamePrefix + '_secret.id.json';
    const publicFileName = fileNamePrefix + '.id.json';
    await writeIdentityWithSecretsToFile(secretFileName, identity.secret);
    await writeIdentityToFile(publicFileName, identity.public);

    return {
        secret: identity.secret,
        public: identity.public,
        secretFileName,
        publicFileName
    };
}

/**
 * Write identity to a file.
 *
 * @param fileName
 * @param identity
 */
export async function writeIdentityToFile(fileName: string, identity: Identity): Promise<void> {
    await writeFile(fileName, JSON.stringify(identity, null, 4), {encoding: 'utf8'});
}

/**
 * Write identity that includes secrets to a file.
 *
 * @param fileName
 * @param identity
 */
export async function writeIdentityWithSecretsToFile(
    fileName: string,
    identity: IdentityWithSecrets
) {
    await writeFile(fileName, JSON.stringify(identity, null, 4), {encoding: 'utf8'});
}

/**
 * Read identity from a file.
 *
 * @param fileName
 */
export async function readIdentityFile(fileName: string): Promise<Identity> {
    const data = JSON.parse(await readFile(fileName, {encoding: 'utf8'}));

    if (!isIdentity(data)) {
        throw new Error('Format of identity file with secrets is wrong.');
    }

    return data;
}

/**
 * Read identity that includes secrets from a file.
 *
 * @param fileName
 */
export async function readIdentityWithSecretsFile(fileName: string): Promise<IdentityWithSecrets> {
    const data = JSON.parse(await readFile(fileName, {encoding: 'utf8'}));

    if (!isIdentityWithSecrets(data)) {
        throw new Error('Format of identity file with secrets is wrong.');
    }

    return data;
}

/**
 * Read an identity from the specified file or create a random one.
 *
 * If and identity file does not exist it will create a file with a random identity.
 * Prerequisite is, that the filename ends in '_secret.id.json'
 *
 * If you set filename to abc_secret.id.json then this will generate the following files:
 * - abc_secret.id.json
 * - abc.id.json
 *
 * @param fileName - The file rom which to read / to which to write the identity to.
 * @param commServerUrl - commserver to include in the randomly generated identity.
 */
export async function readIdentityWithSecretsFileOrWriteRandom(
    fileName: string,
    commServerUrl: string
): Promise<IdentityWithSecrets> {
    if (!fileName.endsWith('_secret.id.json')) {
        throw new Error(
            'If you want to generate an identity, the secret idendity filename  needs to end with _secret.id.json'
        );
    }

    let identity: IdentityWithSecrets;
    if (existsSync(fileName)) {
        identity = await readIdentityWithSecretsFile(fileName);
    } else {
        const id = await writeRandomIdentityToFile(
            fileName.slice(0, -'_secret.id.json'.length),
            commServerUrl
        );
        identity = id.secret;
    }
    return identity;
}

// ######## Identity I/O using one objects ########

/**
 * Import an identity as OneInstanceEndpoint.
 *
 * This also signs the keys with our own key, so that they are considered trusted keys.
 *
 * @param fileName
 */
export async function importIdentityFromFileAsOneInstanceEndpoint(
    fileName: string
): Promise<UnversionedObjectResult<OneInstanceEndpoint>> {
    const identity = await readIdentityFile(fileName);
    return storeIdentityAsOneInstanceEndpoint(identity);
}

/**
 * Export an OneInstanceEndpoint as Identity file.
 *
 * @param fileName
 * @param oneInstanceEndpoint
 */
export async function exportIdentityToFileFromOneInstanceEndpoint(
    fileName: string,
    oneInstanceEndpoint: SHA256Hash<OneInstanceEndpoint>
): Promise<void> {
    const identity = await loadOneInstanceEndpointAsIdentity(oneInstanceEndpoint);
    return writeIdentityToFile(fileName, identity);
}
