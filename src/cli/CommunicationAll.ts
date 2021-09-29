import yargs from 'yargs';

import * as Logger from 'one.core/lib/logger';
import {AccessModel, ChannelManager, ConnectionsModel, LeuteModel} from '../models';
import InstancesModel from '../models/InstancesModel';
import {initInstance, registerRecipes} from 'one.core/lib/instance';
import RecipesStable from '../recipes/recipes-stable';
import RecipesExperimental from '../recipes/recipes-experimental';
import type {Module} from 'one.core/lib/recipes';
import oneModules from '../generated/oneModules';
import type {VersionedObjectResult} from 'one.core/lib/storage';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
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
    const leuteModel = new LeuteModel(instancesModel, argv.u);
    const connectionsModel = new ConnectionsModel(leuteModel, instancesModel, {
        commServerUrl: argv.u
    });

    console.log('INITIAL ONLINE STATE IS: ' + connectionsModel.onlineState);
    connectionsModel.onOnlineStateChange((state: boolean) => {
        console.log('ONLINE STATE IS NOW: ' + state);
    });

    await initInstance({
        name: 'inst_' + argv.i,
        email: 'email_' + argv.i,
        secret: '1234',
        encryptStorage: false,
        ownerName: 'name_' + argv.i,
        initialRecipes: [...RecipesStable, ...RecipesExperimental]
        // initiallyEnabledReverseMapTypes: new Map([['Instance', new Set('owner')]])
    });
    await importModules();
    await registerRecipes([...RecipesStable, ...RecipesExperimental]);

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
    await connectionsModel.init();
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString(), e.stack);
});
