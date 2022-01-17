import type {LeuteModel} from '../models';
import type InstancesModel from '../models/InstancesModel';
import {printUint8Array} from '../misc/LogUtils';
import fs from 'fs';
import {implode} from '@refinio/one.core/lib/microdata-imploder';
import readline from 'readline';
import {fromByteArray, toByteArray} from 'base64-js';
import {createProfileFromIdentity, IdentityWithSecrets} from '../misc/IdentityExchange';
import {mkdir} from 'fs/promises';
import {initInstance} from '@refinio/one.core/lib/instance';
import {hexToArrayBuffer} from '../misc/ArrayBufferHexConvertor';
import RecipesStable from '../recipes/recipes-stable';
import RecipesExperimental from '../recipes/recipes-experimental';

export async function waitForKeyPress(): Promise<void> {
    await new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Press a key', answer => resolve(answer));
    });
}

/**
 * Imports the identity file to Leute by saving a Profile object.
 * Leute hook will automatically create a connection once a profile is saved.
 * @param ownFile
 */
export async function importIdentityToLeute(ownFile: string): Promise<void> {
    // Read all key files except our own
    console.log('Read *.id files');
    const filter = '.id.json';
    const files = fs.readdirSync('.');
    const identityFiles = files
        .filter(file => file.endsWith(filter))
        .filter(file => !file.includes(ownFile) && !file.includes('_secret'));
    const identityObjects = identityFiles.map(file => fs.readFileSync(file, {encoding: 'utf-8'}));

    await Promise.all(
        identityObjects.map(async identity => {
            await createProfileFromIdentity(JSON.parse(identity));
        })
    );
    console.log('Imported identity objects:', identityObjects.length);
}

/**
 * Init the instance with the given Identity Object.
 * @param identity
 */
export async function initInstanceWithIdentity(identity: IdentityWithSecrets): Promise<void> {
    await mkdir('./OneDB', {recursive: true});
    await initInstance({
        name: identity.instanceName,
        email: identity.personEmail,
        publicEncryptionKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.personKeyPublic))
        ),
        secretEncryptionKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.personKeySecret))
        ),
        publicSignKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.personSignKeyPublic))
        ),
        secretSignKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.personSignKeySecret))
        ),
        publicInstanceEncryptionKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.instanceKeyPublic))
        ),
        secretInstanceEncryptionKey: fromByteArray(
            new Uint8Array(hexToArrayBuffer(identity.instanceKeySecret))
        ),
        encryptStorage: false,
        secret: 'dummy',
        directory: 'OneDB',
        initialRecipes: [...RecipesStable, ...RecipesExperimental]
    });
}
