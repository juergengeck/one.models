import yargs from 'yargs';
import * as Logger from 'one.core/lib/logger';
import {printUint8Array} from '../misc/LogUtils';
import type EncryptedConnection from '../misc/EncryptedConnection';
import {AccessModel, ChannelManager, LeuteModel} from '../models';
import CommunicationModule from '../misc/CommunicationModule';
import InstancesModel from '../models/InstancesModel';
import {initInstance} from 'one.core/lib/instance';
import RecipesStable from '../recipes/recipes-stable';
import oneModules from '../generated/oneModules';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
import type {VersionedObjectResult} from 'one.core/lib/storage';
import * as readline from 'readline';
import type {Module, Person} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import {importProfiles, waitForKeyPress, writeMainProfile} from './cliHelpers';

/**
 * Import all plan modules
 */
async function importModules(): Promise<VersionedObjectResult<Module>[]> {
    const modules = Object.keys(oneModules).map(key => ({
        moduleName: key,
        code: oneModules[key as keyof typeof oneModules]
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
    const leuteModel = new LeuteModel(instancesModel, argv.u);
    const communicationModule = new CommunicationModule(argv.u, leuteModel, instancesModel);
    communicationModule.onKnownConnection(
        (
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
        }
    );
    communicationModule.onUnknownConnection(
        (
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
        leuteModel.addNewContactObject(contactObject);*/
        }
    );

    // Create the instance
    await initInstance({
        name: 'inst_' + argv.i,
        email: 'email_' + argv.i,
        secret: '1234',
        encryptStorage: false,
        ownerName: 'name_' + argv.i,
        initialRecipes: RecipesStable
        // initiallyEnabledReverseMapTypes: new Map([['Instance', new Set('owner')]])
    });
    await importModules();

    // Init models
    await accessModel.init();
    await instancesModel.init('secret_' + argv.i);
    await leuteModel.init();
    await channelManager.init();

    const myProfileFile = `${argv.i}_main.profile`;
    await writeMainProfile(leuteModel, instancesModel, myProfileFile);
    await waitForKeyPress();
    await importProfiles(myProfileFile);

    // Start the communication module
    console.log('Start the comm module');

    /**
     * TODO: Register leute callback for new updates?
     */
    /*leuteModel.onContactUpdate(() => {
        console.log('ADDED a contact');
    });*/
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
