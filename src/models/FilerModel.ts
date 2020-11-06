/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';

import {ChannelManager} from './index';
import FileSystem from '../misc/FileSystem';
import {createSingleObjectThroughPurePlan} from 'one.core/lib/plan';
import {getObject, VERSION_UPDATES} from 'one.core/lib/storage';
import {FilerDirectory, SHA256Hash} from '@OneCoreTypes';
import {serializeWithType} from 'one.core/lib/util/promise';

export default class FilerModel extends EventEmitter {
    private readonly channelManager: ChannelManager;
    private readonly fileSystemChannelId: string;
    private fileSystem: FileSystem | null = null;
    private readonly boundOnChannelUpdateHandler: (id: string) => Promise<void>;

    /**
     *
     * @param {ChannelManager} channelManager
     */
    public constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.fileSystemChannelId = 'mainFileSystemChannelId';
        this.boundOnChannelUpdateHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * create the channel & the root directory if it does not exists
     * @returns {Promise<void>}
     */
    public async init() {
        const rootHash = await this.createRootDirectoryIfNotExists();
        this.fileSystem = new FileSystem(rootHash);
        this.fileSystem.onRootUpdate = this.boundOnFileSystemUpdateHandler.bind(this);
        this.channelManager.on('updated', async () => await this.boundOnChannelUpdateHandler);
    }

    /**
     *
     * @param {SHA256Hash<FilerDirectory>} rootHash
     * @returns {Promise<void>}
     * @private
     */
    private async boundOnFileSystemUpdateHandler(
        rootHash: SHA256Hash<FilerDirectory>
    ): Promise<void> {
        await serializeWithType('FileSystemLock', async () => {
            const rootDirectory = await this.channelManager.getObjectsWithType('FilerDirectory', {
                channelId: this.fileSystemChannelId
            });

            if (rootDirectory[0]) {
                if (rootDirectory[0].dataHash !== rootHash) {
                    const fs = await getObject(rootHash);
                    await this.channelManager.postToChannel(this.fileSystemChannelId, fs);
                    if (!this.fileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.fileSystem.updateRoot = rootHash;
                }
            } else {
                throw new Error('Module was not instantiated');
            }
        });
    }

    /**
     *
     * @returns {FileSystem}
     */
    public get fs(): FileSystem {
        if (!this.fileSystem) {
            throw new Error('Module was not instantiated');
        }
        return this.fileSystem;
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    private async createRootDirectoryIfNotExists(): Promise<SHA256Hash<FilerDirectory>> {
        await this.channelManager.createChannel(this.fileSystemChannelId);

        const rootDirectory = await this.channelManager.getObjectsWithType('FilerDirectory', {
            channelId: this.fileSystemChannelId
        });
        if (rootDirectory.length === 0) {
            const root = await createSingleObjectThroughPurePlan({
                module: '@module/createRootFilerDirectory',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            });
            await this.channelManager.postToChannel(this.fileSystemChannelId, root.obj);
            return root.hash;
        }
        return rootDirectory[rootDirectory.length - 1].dataHash as SHA256Hash<FilerDirectory>;
    }

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        await serializeWithType('FileSystemLock', async () => {
            if (id === this.fileSystemChannelId) {
                const rootDirectory = await this.channelManager.getObjectsWithType(
                    'FilerDirectory',
                    {
                        channelId: this.fileSystemChannelId
                    }
                );

                if (rootDirectory[0]) {
                    if (!this.fileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.fileSystem.updateRoot = rootDirectory[0].dataHash as SHA256Hash<
                        FilerDirectory
                    >;
                } else {
                    throw new Error('Module was not instantiated');
                }
                this.emit('updated');
            }
        });
    }
}
