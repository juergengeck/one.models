/**
 * This file is a minimal example for using multiple ONE instances.
 *
 * This example sets up a single one instance and tries to connect to other instances. It will
 * print the status of the established connections every three seconds.
 *
 * Q: How do the individual one instances find each other?
 * A: Each instance writes its own identity / contact information into a file (name.id.json) and
 * other instances import it and then know how to contact this instance.
 *
 * How you use this script:
 * Step 1: You call this script in multiple terminals with different instance names:
 *     Terminal 1: node ./lib/tools/CommunicationAll -i i1
 *     Terminal 2: node ./lib/tools/CommunicationAll -i i2
 *     ...
 *
 *     This will write a file with <name>.id.json
 * Step 2:
 *     After all terminals prompt you with
 *     "Press a key to continue when you started all other processes ..."
 *     you press a key in each terminal
 *
 *     This will import all *.id.json files in the current process and the app will start making
 *     connections to all others.
 * Step 3:
 *     The app will now print every 3 seconds the number of established connections. If you kill
 *     one or more instances the count for the others goes down. If you restart them, the count
 *     goes up again.
 */
import yargs from 'yargs';

import * as Logger from '@refinio/one.core/lib/logger';
import {AccessModel, ChannelManager, ConnectionsModel, LeuteModel} from '../models';
import InstancesModel from '../models/InstancesModel';
import {closeInstance, initInstance} from '@refinio/one.core/lib/instance';
import RecipesStable from '../recipes/recipes-stable';
import RecipesExperimental from '../recipes/recipes-experimental';
import oneModules from '../generated/oneModules';
import {importModules, waitForKeyPress} from './cliHelpers';
import {importIdentityFilesAsProfiles, readOrCreateIdentityFile} from '../misc/IdentityExchange-fs';
import {
    convertIdentityToInstanceOptions,
    Identity,
    IdentityWithSecrets
} from '../misc/IdentityExchange';

/**
 * Parses command line options for this app.
 */
function parseCommandLine(): {
    commServerUrl: string;
    instanceName: string;
    displayDetails: boolean;
} {
    const argv =
        // Evaluate
        yargs

            // Url of communication server
            .alias('u', 'url')
            .describe('u', 'Url of communication server.')
            .default('u', 'ws://localhost:8000')

            // Instance name that shall be used
            .describe('i', 'Instance name')
            .string('i')
            .demandOption('i')

            // Display connection details
            .describe('d', 'Display connection details')
            .boolean('d')
            .default('d', false)

            // Logger
            .describe('l', 'Enable logger')
            .boolean('l')

            // Logger
            .describe('d', 'Enable logger (all)')
            .boolean('d').argv;

    // Initialize Logger
    if (argv.l) {
        Logger.start({types: ['log']});
    }
    if (argv.d) {
        Logger.start();
    }

    return {
        commServerUrl: argv.u,
        instanceName: argv.i,
        displayDetails: argv.d === undefined ? false : argv.d
    };
}

/**
 * Setup the one.core specific stuff.
 *
 * This just initializes the instance.
 *
 * @param identity
 */
async function setupOneCore(identity: Identity | IdentityWithSecrets): Promise<{
    shutdown: () => Promise<void>;
}> {
    await initInstance({
        ...convertIdentityToInstanceOptions(identity, 'dummy'),
        encryptStorage: false,
        directory: 'OneDB',
        initialRecipes: [...RecipesStable, ...RecipesExperimental]
    });

    async function shutdown(): Promise<void> {
        closeInstance();
    }
    return {shutdown};
}

/**
 * Setup the one.models stuff
 *
 * This initializes the models and imports the plan modules (code managed by one)
 *
 * @param commServerUrl
 */
async function setupOneModels(commServerUrl: string): Promise<{
    access: AccessModel;
    instances: InstancesModel;
    channelManager: ChannelManager;
    leute: LeuteModel;
    connections: ConnectionsModel;
    shutdown: () => Promise<void>;
}> {
    await importModules(oneModules);

    // Construct models
    const access = new AccessModel();
    const instances = new InstancesModel();
    const channelManager = new ChannelManager(access);
    const leute = new LeuteModel(instances, commServerUrl);
    const connections = new ConnectionsModel(leute, instances, {
        commServerUrl
    });

    // Initialize models
    await access.init();
    await instances.init('dummy');
    await leute.init();
    await channelManager.init();
    await connections.init();

    // Setup shutdown
    async function shutdown(): Promise<void> {
        await connections.shutdown();
        await channelManager.shutdown();
        await leute.shutdown();
        await instances.shutdown();
        await access.shutdown();

        closeInstance();
    }

    return {
        access,
        instances,
        leute,
        channelManager,
        connections,
        shutdown
    };
}

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    // ######## Initialization / Setup ########

    const {commServerUrl, instanceName, displayDetails} = parseCommandLine();

    // ######## Step 1: Create own identity (if not alread done) and setup app ########
    const identity = await readOrCreateIdentityFile(
        `${instanceName}.id.json`,
        commServerUrl,
        undefined,
        instanceName
    );

    // Setup one.core
    const oneCore = await setupOneCore(identity);
    // Setup one.models
    const oneModels = await setupOneModels(commServerUrl);

    // Setup shutdown
    async function shutdown(): Promise<void> {
        console.log('Shutting down application');
        if (intervalHandle !== undefined) {
            clearInterval(intervalHandle);
        }
        await oneModels.shutdown();
        await oneCore.shutdown();
    }
    process.on('SIGINT', () => shutdown().catch(console.error));

    // ######## Step 2: Import other identities ########

    // Wait for all apps to have written their identity files ...
    await waitForKeyPress('Press a key to continue when you started all other processes ...');
    // ... and then import them
    const profiles = await importIdentityFilesAsProfiles(`${instanceName}.id.json`);
    console.log(`Imported ${profiles.length} profiles.`);

    // ######## Step 3: Print connection information each 3 seconds ########

    // Print connection status continuously
    const intervalHandle = setInterval(() => {
        const connectionInfos = oneModels.connections.connectionsInfo();
        const connCount = connectionInfos.filter(info => info.isConnected).length;
        connectionInfos.map(info => info.isConnected);
        console.log(`OnelineState: ${oneModels.connections.onlineState}`);
        console.log(`Connections established: ${connCount}`);
        if (displayDetails) {
            console.log(connectionInfos);
        }
    }, 3000);
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString(), e.stack);
});
