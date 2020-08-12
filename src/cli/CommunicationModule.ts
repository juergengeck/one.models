import yargs from 'yargs';
import * as Logger from 'one.core/lib/logger';
import {printUint8Array} from '../misc/LogUtils';
import EncryptedConnection from '../misc/EncryptedConnection';
import {AccessModel, ChannelManager, ContactModel} from '../models';
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
            .boolean('l').argv;

    if (argv.l) {
        Logger.start({types: ['log']});
    }

    // Initialize models
    const instancesModel = new InstancesModel();
    const accessModel = new AccessModel();
    const channelManager = new ChannelManager(accessModel);
    const contactModel = new ContactModel(instancesModel, argv.u, channelManager);
    const communicationModule = new CommunicationModule(argv.u, contactModel, instancesModel);
    communicationModule.onKnownConnection = (
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>
    ) => {
        console.log('onKnownConnection');
        printUint8Array('localPublicKey', localPublicKey);
        printUint8Array('remotePublicKey', remotePublicKey);
        console.log(`---- localPersonId: ${localPersonId}`);
        console.log(`---- remotePersonId: ${remotePersonId}`);
    };
    communicationModule.onUnknownConnection = (
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>
    ) => {
        console.log('onUnknownConnection');
        printUint8Array('localPublicKey', localPublicKey);
        printUint8Array('remotePublicKey', remotePublicKey);
        console.log(`---- localPersonId: ${localPersonId}`);

        // Adding contact object
        /*const instanceEndpoint = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'OneInstanceEndpoint',
                personId: personIdHash,
                instanceId: instanceIdHash,
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: instancePubEncryptionKeysHash,
                url: contactObjUrl
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Contact',
                personId: personIdHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );
        contactModel.addNewContactObject(contactObject);*/
    };

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
    alternateIds = alternateIds.filter(id => id !== person);
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
    console.log(contactObjects);

    // Import all contact objs into instance
    console.log('Import contact objects:', contactObjects.length);
    if (contactObjects.length > 0) {
        console.log(
            await createManyObjectsThroughPurePlan(
                {
                    module: '@module/explodeObject',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                contactObjects
            )
        );
    }

    // Start the communication module
    console.log('Start the comm module');

    contactModel.on(ContactEvent.UpdatedContact, () => {
        console.log('ADDED a contact');
    });
    await new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Press a key', answer => resolve(answer));
    });
    await communicationModule.init();

    //
    // // The websocket that is connected to the console
    // let consoleWs: EncryptedConnection | null = null;
    //
    // // Create commserver listener and register callbacks
    // const connManager = new IncomingConnectionManager();
    // connManager.listenForCommunicationServerConnections(
    //     argv.u,
    //     keyPair.publicKey,
    //     (pubkey: Uint8Array, text: Uint8Array): Uint8Array => {
    //         return encryptWithPublicKey(pubkey, text, keyPair.secretKey);
    //     },
    //     (pubkey: Uint8Array, cypherText: Uint8Array): Uint8Array => {
    //         return decryptWithPublicKey(pubkey, cypherText, keyPair.secretKey);
    //     }
    // );
    // connManager.listenForDirectConnections(
    //     'localhost',
    //     8001,
    //     keyPair.publicKey,
    //     (pubkey: Uint8Array, text: Uint8Array): Uint8Array => {
    //         return encryptWithPublicKey(pubkey, text, keyPair.secretKey);
    //     },
    //     (pubkey: Uint8Array, cypherText: Uint8Array): Uint8Array => {
    //         return decryptWithPublicKey(pubkey, cypherText, keyPair.secretKey);
    //     }
    // );
    //
    // connManager.onConnection = async (
    //     conn: EncryptedConnection,
    //     localPublicKey: Uint8Array,
    //     remotePublicKey: Uint8Array
    // ): Promise<void> => {
    //     try {
    //         console.log(`${wslogId(conn.webSocket)}: Accepted connection.`);
    //
    //         // Release old connection
    //         if (consoleWs) {
    //             consoleWs.webSocket.close(1000, 'New client connected');
    //         }
    //
    //         // Connect the websocket to the console
    //         console.log(
    //             `${wslogId(conn.webSocket)}: Connect websocket to console. You can now type stuff.`
    //         );
    //         consoleWs = conn;
    //         consoleWs.webSocket.addEventListener('error', e => {
    //             console.log(e.message);
    //         });
    //         consoleWs.webSocket.addEventListener('close', e => {
    //             if (e.reason !== 'New client connected') {
    //                 consoleWs = null;
    //             }
    //             console.log(`${wslogId(conn.webSocket)}: Connection closed: ${e.reason}`);
    //         });
    //
    //         // Wait for messages
    //         while (conn.webSocket.readyState === WebSocket.OPEN) {
    //             console.log(await conn.waitForMessage());
    //         }
    //     } catch (e) {
    //         console.log(`${wslogId(conn.webSocket)}: ${e}`);
    //     }
    // };
    //
    // // ######## CONSOLE I/O ########
    //
    // // Setup console for communication with the other side
    // const rl = readline.createInterface({
    //     input: process.stdin,
    //     output: process.stdout
    // });
    //
    // // Stop everything at sigint
    // function sigintHandler() {
    //     connManager.shutdown();
    //     if (consoleWs) {
    //         if (consoleWs.webSocket.readyState === WebSocket.OPEN) {
    //             consoleWs.close();
    //         }
    //     }
    //     rl.close();
    // }
    // rl.on('SIGINT', sigintHandler);
    // process.on('SIGINT', sigintHandler);
    //
    // // Read from stdin
    // for await (const line of rl) {
    //     if (!consoleWs) {
    //         console.log('Error: Not connected to any client.');
    //     } else {
    //         // TODO: check this never error
    //         // @ts-ignore
    //         await consoleWs.sendMessage(line);
    //     }
    // }

    function sigintHandler() {
        console.log('SHUTDOWN STUFF');
        communicationModule.shutdown();
    }
    process.on('SIGINT', sigintHandler);
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString(), e.stack);
});
