import yargs from 'yargs';
import * as Logger from 'one.core/lib/logger';
import {printUint8Array} from '../misc/LogUtils';
import {AccessModel, ChannelManager, ConnectionsModel, ContactModel} from '../models';
import CommunicationModule from '../misc/CommunicationModule';
import InstancesModel from '../models/InstancesModel';
import {initInstance} from 'one.core/lib/instance';
import Recipies from '../recipes/recipes';
import {Module, Person, SHA256IdHash, VersionedObjectResult} from '@OneCoreTypes';
import oneModules from '../generated/oneModules';
import {
    createManyObjectsThroughPurePlan,
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {implode} from 'one.core/lib/microdata-imploder';
import fs from 'fs';
import * as readline from 'readline';
import {toByteArray} from 'base64-js';
import {ContactEvent} from '../models/ContactModel';

/**
 * Import all plan modules
 */
async function importModules(): Promise<VersionedObjectResult<Module>[]> {
    const modules = Object.keys(oneModules).map(key => ({
        moduleName: key,
        code: oneModules[key]
    }));

    return Promise.all(
        modules.map(module =>
            createSingleObjectThroughPurePlan(
                {
                    module: '@one/module-importer',
                    versionMapPolicy: {
                        '*': VERSION_UPDATES.NONE_IF_LATEST
                    }
                },
                module
            )
        )
    );
}

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    const argv =
        // Evaluate
        yargs

            // Url of communication server
            .alias('u', 'url')
            .describe('u', 'Url of communication server.')
            .default('u', 'ws://localhost:8000')

            // Write public key
            .describe('i', 'Instance name')
            .default('i', 'instance1')

            // Logger
            .describe('l', 'Enable logger')
            .boolean('l')

            // Logger
            .describe('d', 'Enable logger (all)')
            .boolean('d').argv;

    if (argv.l) {
        Logger.start({types: ['log']});
    }
    if (argv.d) {
        Logger.start();
    }

    // Initialize models
    const accessModel = new AccessModel();
    const instancesModel = new InstancesModel();
    const channelManager = new ChannelManager(accessModel);
    const contactModel = new ContactModel(instancesModel, argv.u, channelManager);
    const communicationModule = new CommunicationModule(argv.u, contactModel, instancesModel);
    const connectionsModel = new ConnectionsModel(argv.u, contactModel, instancesModel, accessModel, false);

    console.log('INITIAL ONLINE STATE IS: ' + connectionsModel.onlineState);
    connectionsModel.onOnlineStateChange = (state: boolean) => {
        console.log('ONLINE STATE IS NOW: ' + state);
    }

    // Create the instance
    await initInstance({
        name: 'inst_' + argv.i,
        email: 'email_' + argv.i,
        secret: '1234',
        encryptStorage: false,
        ownerName: 'name_' + argv.i,
        initialRecipes: Recipies
        //        initiallyEnabledReverseMapTypes: new Map([['Instance', new Set('owner')]])
    });
    await importModules();

    // Init models
    await accessModel.init();

    await instancesModel.init('secret_' + argv.i);
    await contactModel.init();

    await channelManager.init();
    await contactModel.createContactChannel();
    const person = await contactModel.myMainIdentity();

    // Find the anonymous id
    let personAnon: SHA256IdHash<Person>;
    let alternateIds = await contactModel.myIdentities();
    alternateIds = alternateIds.filter((id: SHA256IdHash<Person>) => id !== person);
    if (alternateIds.length > 1) {
        throw new Error('Application expects exactly one alternate identity.');
    } else if (alternateIds.length < 1) {
        personAnon = await contactModel.createProfile(true);
    } else {
        personAnon = alternateIds[0];
    }

    console.log('MAIN ID: ', person);
    console.log('ANON ID: ', personAnon);
    printUint8Array(
        'MAIN pubkey',
        toByteArray((await instancesModel.instanceKeysForPerson(person)).publicKey)
    );
    printUint8Array(
        'ANON pubkey',
        toByteArray((await instancesModel.instanceKeysForPerson(personAnon)).publicKey)
    );

    // Get the contact objects for the main and anon id
    const mainContactObjects = await contactModel.getContactIdObjects(person);
    const anonContactObjects = await contactModel.getContactIdObjects(personAnon);
    if (mainContactObjects.length !== 1) {
        throw new Error('There is more than one contact object for main user.');
    }
    if (anonContactObjects.length !== 1) {
        throw new Error('There is more than one contact object for anon user.');
    }

    // Write the contact objects to files, so that others can import them.
    //fs.writeFileSync(`${argv.i}_main.contact`, await implode(mainContactObjects[0]));
    fs.writeFileSync(`${argv.i}_anon.contact`, await implode(anonContactObjects[0]));

    // Wait here for user input
    await new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Press a key', answer => resolve(answer));
    });

    // Read all key files except our own
    console.log('Wait Read .contact files');
    const filter = '.contact';
    const files = fs.readdirSync('.');
    const keyFiles = files
        .filter(file => file.endsWith(filter))
        .filter(file => !file.startsWith(`${argv.i}_`));
    const contactObjects = keyFiles.map(file => fs.readFileSync(file, {encoding: 'utf-8'}));

    // Import all contact objs into instance
    console.log('Import contact objects:', contactObjects.length);
    if (contactObjects.length > 0) {
        await createManyObjectsThroughPurePlan(
            {
                module: '@module/explodeObject',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            contactObjects
        );
    }

    // Start the communication module
    console.log('Start the comm module');
    contactModel.on(ContactEvent.UpdatedContact, () => {
        console.log('ADDED a contact');
    });
    await communicationModule.init();
    await connectionsModel.init();
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString(), e.stack);
});
