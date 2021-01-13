/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import Recipes from '../../lib/recipes/recipes';

import {closeInstance, initInstance} from 'one.core/lib/instance';
import {
    ContactModel,
    ConnectionsModel,
    ChannelManager,
    AccessModel,
    InstancesModel,
    ECGModel,
    ConsentFileModel,
    BodyTemperatureModel
} from '../../lib/models';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {Module, Person, SHA256IdHash, VersionedObjectResult} from '@OneCoreTypes';
import oneModules from '../../lib/generated/oneModules';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
export const dbKey = 'testDb';
const path = require('path');
const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const lstat = util.promisify(fs.lstat);
const unlink = util.promisify(fs.unlink);
const rmdir = util.promisify(fs.rmdir);

export async function removeDir(dir: string) {
    try {
        const files = await readdir(dir);
        await Promise.all(
            files.map(async (file: string) => {
                try {
                    const p = path.join(dir, file);
                    const stat = await lstat(p);
                    if (stat.isDirectory()) {
                        await removeDir(p);
                    } else {
                        await unlink(p);
                    }
                } catch (err) {
                    console.error(err);
                }
            })
        );
        await rmdir(dir);
    } catch (err) {
        console.error(err);
    }
}
/**
 * Import all plan modules
 */
export async function importModules(): Promise<VersionedObjectResult<Module>[]> {
    const modules = Object.keys(oneModules).map(key => ({
        moduleName: key,
        code: oneModules[key]
    }));

    return await Promise.all(
        modules.map(
            async module =>
                await createSingleObjectThroughPurePlan(
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
export default class TestModel {
    private readonly secret: string;
    private readonly directoryPath: string;
    constructor(commServerUrl: string, directoryPath: string) {
        this.secret = 'test-secret';
        this.instancesModel = new InstancesModel();
        this.directoryPath = directoryPath;
        this.accessModel = new AccessModel();
        this.channelManager = new ChannelManager(this.accessModel);
        this.consentFile = new ConsentFileModel(this.channelManager);
        this.contactModel = new ContactModel(
            this.instancesModel,
            commServerUrl,
            this.channelManager
        );
        this.ecgModel = new ECGModel(this.channelManager);
        this.bodyTemperature = new BodyTemperatureModel(this.channelManager);
    }

    private async setupMyIds(
        anonymousEmail?: string,
        takeOver?: boolean
    ): Promise<{
        mainId: SHA256IdHash<Person>;
        anonymousId: SHA256IdHash<Person>;
    }> {
        // Setup identities if necessary
        let anonymousId;
        const mainId = await this.contactModel.myMainIdentity();
        const myIdentities = await this.contactModel.myIdentities();
        if (myIdentities.length === 2) {
            anonymousId = myIdentities[0] === mainId ? myIdentities[1] : myIdentities[0];
        } else if (anonymousEmail) {
            anonymousId = await this.contactModel.createNewIdentity(true, anonymousEmail, takeOver);
        } else {
            anonymousId = await this.contactModel.createNewIdentity(true);
        }

        return {
            mainId,
            anonymousId
        };
    }

    async createInstance(directory: string) {
        const email = await createRandomString(64);
        const instanceName = await createRandomString(64);
        await initInstance({
            name: `test-${instanceName}`,
            email: `test-${email}`,
            secret: this.secret,
            ownerName: `test-${email}`,
            initialRecipes: Recipes,
            directory: directory
        });
    }

    async init(
        anonymousEmail?: string,
        takeOver?: boolean,
        recoveryState?: boolean
    ): Promise<void> {
        /**
         * In instance take over and in recovery process the main person and
         * the anonymous person keys will be overwritten, so the first generated
         * keys can be ignored, because they will not be used after the overwrite
         * process is completed.
         *
         * This is just a temporarty workaround! (only a hack!)
         */
        const ownerWillBeOverwritten = takeOver || recoveryState;

        // Initialize contact model. This is the base for identity handling and everything
        await this.contactModel.init(ownerWillBeOverwritten);
        await this.accessModel.init();
        await this.instancesModel.init(this.secret);
        // Setup the identities
        const {mainId, anonymousId} = await this.setupMyIds(anonymousEmail, ownerWillBeOverwritten);
        this.consentFile.setPersonId(anonymousId);

        // Initialize the rest of the models
        await this.channelManager.init(anonymousId);
        await this.ecgModel.init();
        await this.consentFile.init();
        await this.bodyTemperature.init();
    }

    /**
     * Shutdown the models.
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        try {
            await this.ecgModel.shutdown();
        } catch (e) {
            console.error(e);
        }
        try {
            await this.consentFile.shutdown();
        } catch (e) {
            console.error(e);
        }

        try {
            await this.channelManager.shutdown();
        } catch (e) {
            console.error(e);
        }

        try {
            await this.contactModel.shutdown();
        } catch (e) {
            console.error(e);
        }
        closeInstance();
    }
    ecgModel: ECGModel;
    consentFile: ConsentFileModel;
    instancesModel: InstancesModel;
    channelManager: ChannelManager;
    bodyTemperature: BodyTemperatureModel;
    contactModel: ContactModel;
    connections: ConnectionsModel;
    accessModel: AccessModel;
}
