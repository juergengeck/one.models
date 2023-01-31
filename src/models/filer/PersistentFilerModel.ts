/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';

import type {ChannelManager} from '../index';
import PersistentFileSystem from '../../fileSystems/PersistentFileSystem';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import type {ObjectData} from '../ChannelManager';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {
    PersistentFileSystemDirectory,
    PersistentFileSystemRoot
} from '../../recipes/PersistentFileSystemRecipes';
import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';

/**
 * This model can bring and handle different file systems (see {@link PersistentFileSystem}).
 * Because the file systems should be independent of our data types, this model takes care of the channel's implementation
 * and can hook different events on specific file systems(e.g update event).
 */
export default class PersistentFilerModel extends EventEmitter {
    private readonly channelManager: ChannelManager;
    private readonly fileSystemChannelId: string;

    private fs: PersistentFileSystem | null = null;
    private readonly disconnect: (() => void) | undefined;
    private readonly storage: string | undefined;

    /**
     *
     * @param {ChannelManager} channelManager
     * @param channelId
     * @param storage
     */
    public constructor(
        channelManager: ChannelManager,
        channelId = 'mainFileSystemChannelId',
        storage?: string
    ) {
        super();
        this.channelManager = channelManager;
        this.fileSystemChannelId = channelId;
        this.storage = storage;
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * create the channel & the root directory if it does not exist
     * @returns {Promise<void>}
     */
    public async init() {
        const root = await this.createRootDirectoryIfNotExists();
        this.fs = new PersistentFileSystem(root, this.storage);

        this.fs.onRootUpdate = this.boundOnFileSystemUpdateHandler.bind(this);
    }

    /**
     *
     * @returns {PersistentFileSystem}
     */
    public get fileSystem(): PersistentFileSystem {
        if (!this.fs) {
            throw new Error('Module was not instantiated');
        }

        return this.fs;
    }

    public async shutdown() {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /** ########################################## Private ########################################## **/

    /**
     *
     * @param {SHA256Hash<PersistentFileSystemDirectory>} _rootHash
     * @returns {Promise<void>}
     * @private
     */
    private async boundOnFileSystemUpdateHandler(
        _rootHash: SHA256Hash<PersistentFileSystemDirectory>
    ): Promise<void> {
        await serializeWithType('FileSystemLock', async () => {
            const rootDirectory = await this.channelManager.getObjectsWithType(
                'PersistentFileSystemRoot',
                {
                    channelId: this.fileSystemChannelId
                }
            );

            if (rootDirectory[0]) {
                const rootDir = await getObject(rootDirectory[0].dataHash);
                if ('root' in rootDir) {
                    const rootStored = await storeUnversionedObject({
                        $type$: 'PersistentFileSystemDirectory',
                        children: []
                    });

                    const updatedRoot = await storeUnversionedObject({
                        $type$: 'PersistentFileSystemRoot',
                        root: {
                            mode: 0o0040777,
                            entry: rootStored.hash
                        }
                    });

                    await this.channelManager.postToChannel(
                        this.fileSystemChannelId,
                        updatedRoot.obj
                    );
                    if (!this.fs) {
                        throw new Error('Module was not instantiated');
                    }
                    this.fs.updateRoot = updatedRoot.obj;
                }
            } else {
                throw new Error('Module was not instantiated');
            }
        });
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    private async createRootDirectoryIfNotExists(): Promise<PersistentFileSystemRoot> {
        await this.channelManager.createChannel(this.fileSystemChannelId);

        const rootDirectory = await this.channelManager.getObjectsWithType(
            'PersistentFileSystemRoot',
            {
                channelId: this.fileSystemChannelId
            }
        );

        if (rootDirectory.length === 0) {
            const rootStored = await storeUnversionedObject({
                $type$: 'PersistentFileSystemDirectory',
                children: []
            });

            const root = await storeUnversionedObject({
                $type$: 'PersistentFileSystemRoot',
                root: {
                    mode: 0o0040777,
                    entry: rootStored.hash
                }
            });
            await this.channelManager.postToChannel(this.fileSystemChannelId, root.obj);
            return root.obj;
        }
        const rootHash = rootDirectory[rootDirectory.length - 1].dataHash;
        return await getObject(rootHash);
    }

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === this.fileSystemChannelId) {
            await serializeWithType('FileSystemLock', async () => {
                if (!this.fs) {
                    throw new Error('Module was not instantiated');
                }
                if (data) {
                    this.fs.updateRoot = data.data as PersistentFileSystemRoot;
                }
                this.emit('updated');
            });
        }
    }
}
