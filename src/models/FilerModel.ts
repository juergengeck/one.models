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
import {FileSystemDirectory, FileSystemRoot, SHA256Hash} from '@OneCoreTypes';
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
        const root = await this.createRootDirectoryIfNotExists();
        this.fileSystem = new FileSystem(root);
        this.fileSystem.onRootUpdate = this.boundOnFileSystemUpdateHandler.bind(this);
        this.channelManager.on('updated', async () => await this.boundOnChannelUpdateHandler);
    }

    /**
     *
     * @param {SHA256Hash<FileSystemDirectory>} rootHash
     * @returns {Promise<void>}
     * @private
     */
    private async boundOnFileSystemUpdateHandler(
        rootHash: SHA256Hash<FileSystemDirectory>
    ): Promise<void> {
        await serializeWithType('FileSystemLock', async () => {
            const rootDirectory = await this.channelManager.getObjectsWithType('FileSystemRoot', {
                channelId: this.fileSystemChannelId
            });

            if (rootDirectory[0]) {
                const rootDir = await getObject(rootDirectory[0].dataHash);
                if ('content' in rootDir && rootDir.content.root !== rootHash) {
                    const updatedRoot = await createSingleObjectThroughPurePlan(
                        {
                            module: '@module/updateRootFileSystemDirectory',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        rootDir,
                        rootHash
                    );
                    await this.channelManager.postToChannel(
                        this.fileSystemChannelId,
                        updatedRoot.obj
                    );
                    if (!this.fileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.fileSystem.updateRoot = updatedRoot.obj;
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
    private async createRootDirectoryIfNotExists(): Promise<FileSystemRoot> {
        await this.channelManager.createChannel(this.fileSystemChannelId);

        const rootDirectory = await this.channelManager.getObjectsWithType('FileSystemDirectory', {
            channelId: this.fileSystemChannelId
        });
        if (rootDirectory.length === 0) {
            const root = await createSingleObjectThroughPurePlan({
                module: '@module/createRootFileSystemDirectory',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            });
            await this.channelManager.postToChannel(this.fileSystemChannelId, root.obj);
            return root.obj;
        }
        const rootHash = rootDirectory[rootDirectory.length - 1].dataHash;
        return (await getObject(rootHash)) as FileSystemRoot;
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
                    'FileSystemRoot',
                    {
                        channelId: this.fileSystemChannelId
                    }
                );

                if (rootDirectory[0]) {
                    if (!this.fileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.fileSystem.updateRoot = (await getObject(
                        rootDirectory[0].dataHash
                    )) as FileSystemRoot;
                } else {
                    throw new Error('Module was not instantiated');
                }
                this.emit('updated');
            }
        });
    }
}
