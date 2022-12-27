/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import {
    AccessModel,
    BodyTemperatureModel,
    ChannelManager,
    LeuteModel,
    ECGModel
} from '../../lib/models';
import oneModules from '../../lib/generated/oneModules';
import {
    createSingleObjectThroughPurePlan,
    VersionedObjectResult,
    VERSION_UPDATES
} from '@refinio/one.core/lib/storage';
import type {Module} from '@refinio/one.core/lib/recipes';

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
        code: oneModules[key as keyof typeof oneModules]
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

    ecgModel: ECGModel;
    channelManager: ChannelManager;
    bodyTemperature: BodyTemperatureModel;
    leuteModel: LeuteModel;
    accessModel: AccessModel;

    constructor(commServerUrl: string) {
        this.secret = 'test-secret';
        this.accessModel = new AccessModel();
        this.leuteModel = new LeuteModel(commServerUrl);
        this.channelManager = new ChannelManager(this.leuteModel);
        this.ecgModel = new ECGModel(this.channelManager);
        this.bodyTemperature = new BodyTemperatureModel(this.channelManager);
    }

    async init(
        anonymousEmail?: string,
        takeOver?: boolean,
        recoveryState?: boolean
    ): Promise<void> {
        await this.accessModel.init();
        await this.leuteModel.init();
        await this.channelManager.init();
        await this.ecgModel.init();
        await this.bodyTemperature.init();
    }

    /**
     * Shutdown the models.
     */
    public async shutdown(): Promise<void> {
        try {
            await this.bodyTemperature.shutdown();
        } catch (e) {
            console.error(e);
        }

        try {
            await this.ecgModel.shutdown();
        } catch (e) {
            console.error(e);
        }

        try {
            await this.channelManager.shutdown();
        } catch (e) {
            console.error(e);
        }

        try {
            await this.leuteModel.shutdown();
        } catch (e) {
            console.error(e);
        }
    }
}
