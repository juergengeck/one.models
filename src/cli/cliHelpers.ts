import type {LeuteModel} from '../models';
import type InstancesModel from '../models/InstancesModel';
import {printUint8Array} from '../misc/LogUtils';
import fs from 'fs';
import {implode} from '@refinio/one.core/lib/microdata-imploder';
import readline from 'readline';
import {createManyObjectsThroughPurePlan, VERSION_UPDATES} from '@refinio/one.core/lib/storage';
import {toByteArray} from 'base64-js';

export async function writeMainProfile(
    leuteModel: LeuteModel,
    instancesModel: InstancesModel,
    filename: string
): Promise<void> {
    const profile = await (await leuteModel.me()).mainProfile();
    if (profile.loadedVersion === undefined) {
        throw new Error('The main profile was not loaded.');
    }

    console.log('MAIN ID: ', profile.personId);
    printUint8Array(
        'MAIN pubkey',
        toByteArray((await instancesModel.localInstanceKeysForPerson(profile.personId)).publicKey)
    );

    // Write the contact objects to files, so that others can import them.
    fs.writeFileSync(filename, await implode(profile.loadedVersion));
}

export async function waitForKeyPress(): Promise<void> {
    await new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Press a key', answer => resolve(answer));
    });
}

export async function importProfiles(ownFile: string): Promise<void> {
    // Read all key files except our own
    console.log('Read *.profile files');
    const filter = '.profile';
    const files = fs.readdirSync('.');
    const keyFiles = files.filter(file => file.endsWith(filter)).filter(file => file !== ownFile);
    const profileObjects = keyFiles.map(file => fs.readFileSync(file, {encoding: 'utf-8'}));

    // Import all contact objs into instance
    console.log('Import contact objects:', profileObjects.length);
    if (profileObjects.length > 0) {
        await createManyObjectsThroughPurePlan(
            {
                module: '@module/explodeObject',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            profileObjects
        );
    }
}
