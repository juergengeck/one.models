/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';

import {ChannelManager} from './index';
import PersistentFileSystem from '../fileSystems/PersistentFileSystem';
import {createSingleObjectThroughPurePlan} from 'one.core/lib/plan';
import {getObject, VERSION_UPDATES} from 'one.core/lib/storage';
import {PersistentFileSystemDirectory, PersistentFileSystemRoot, SHA256Hash} from '@OneCoreTypes';
import {serializeWithType} from 'one.core/lib/util/promise';
import {ObjectsFileSystem} from '../fileSystems';
import ConnectionFileSystem from '../fileSystems/ConnectionFileSystem';
import ConnectionsModel, {PairingInformation} from './ConnectionsModel';
import qrcode from 'qrcode';
import OneInstanceModel from './OneInstanceModel';
import {ConnectionInfo} from '../misc/CommunicationModule';

/**
 * This model can bring and handle different file systems (see {@link PersistentFileSystem , @link ObjectsFileSystem}).
 * Because the file systems should be independent of our data types, this model takes care of the channel's implementation
 * and can hook different events on specific file systems(e.g update event).
 */
export default class FilerModel extends EventEmitter {
    private readonly channelManager: ChannelManager;
    private readonly connectionsModel: ConnectionsModel;
    private readonly oneInstanceModel: OneInstanceModel;
    private readonly fileSystemChannelId: string;

    private persistedFileSystem: PersistentFileSystem | null = null;
    private objectsFileSystem: ObjectsFileSystem | null = null;
    private connectionsFileSystem: ConnectionFileSystem | null = null;

    private readonly boundOnChannelUpdateHandler: (id: string) => Promise<void>;

    /**
     *
     * @param {ChannelManager} channelManager
     * @param {ConnectionsModel} connectionsModel
     * @param {oneInstanceModel} oneInstanceModel
     */
    public constructor(
        channelManager: ChannelManager,
        connectionsModel: ConnectionsModel,
        oneInstanceModel: OneInstanceModel
    ) {
        super();
        this.channelManager = channelManager;
        this.connectionsModel = connectionsModel;
        this.oneInstanceModel = oneInstanceModel;
        this.fileSystemChannelId = 'mainFileSystemChannelId';
        this.boundOnChannelUpdateHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * create the channel & the root directory if it does not exists
     * @returns {Promise<void>}
     */
    public async init() {
        const root = await this.createRootDirectoryIfNotExists();
        this.objectsFileSystem = new ObjectsFileSystem();
        this.persistedFileSystem = new PersistentFileSystem(root);
        this.connectionsFileSystem = new ConnectionFileSystem({content: await this.onConnectionQRCodeRequested()});
        this.connectionsFileSystem.onConnectionQRCodeReceived = this.onConnectionQRCodeReceived.bind(this);
        this.connectionsFileSystem.onConnectionQRCodeRequested = this.onConnectionQRCodeRequested.bind(this);
        this.connectionsFileSystem.onConnectionsInfoRequested = this.onConnectionsInfoRequested.bind(this);

        this.persistedFileSystem.onRootUpdate = this.boundOnFileSystemUpdateHandler.bind(this);
        this.channelManager.on('updated', async () => await this.boundOnChannelUpdateHandler);
    }

    /**
     *
     * @returns {PersistentFileSystem}
     */
    public get persistedFS(): PersistentFileSystem {
        if (!this.persistedFileSystem) {
            throw new Error('Module was not instantiated');
        }
        return this.persistedFileSystem;
    }

    public get objectsFS(): ObjectsFileSystem {
        if (!this.objectsFileSystem) {
            throw new Error('Module was not instantiated');
        }
        return this.objectsFileSystem;
    }

    public get connectionsFS(): ConnectionFileSystem {
        if (!this.connectionsFileSystem) {
            throw new Error('Module was not instantiated');
        }
        return this.connectionsFileSystem;
    }

    /** ########################################## Private ########################################## **/

    private async onConnectionQRCodeRequested(): Promise<Buffer> {
        const pairingInformation = await this.connectionsModel.generatePairingInformation(false);
        const encodedInformation = encodeURIComponent(JSON.stringify(pairingInformation));
        const url = `localhost:3000/invites/invitePartner/?invited=true/#${encodedInformation}`
        return await qrcode.toBuffer(url);
    }

    private async onConnectionQRCodeReceived(
        pairingInformation: PairingInformation
    ): Promise<void> {
        await this.connectionsModel.connectUsingPairingInformation(
            pairingInformation,
            this.oneInstanceModel.getSecret()
        );
    }

    private onConnectionsInfoRequested(): ConnectionInfo[] {
        return this.connectionsModel.connectionsInfo();
    }

    /**
     *
     * @param {SHA256Hash<PersistentFileSystemDirectory>} rootHash
     * @returns {Promise<void>}
     * @private
     */
    private async boundOnFileSystemUpdateHandler(
        rootHash: SHA256Hash<PersistentFileSystemDirectory>
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
                if ('root' in rootDir && rootDir.root.entry !== rootHash) {
                    const updatedRoot = await createSingleObjectThroughPurePlan(
                        {
                            module: '@module/persistentFileSystemUpdateRoot',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        rootDir,
                        rootHash
                    );
                    await this.channelManager.postToChannel(
                        this.fileSystemChannelId,
                        updatedRoot.obj
                    );
                    if (!this.persistedFileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.persistedFileSystem.updateRoot = updatedRoot.obj;
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
            const root = await createSingleObjectThroughPurePlan({
                module: '@module/persistentFileSystemCreateRoot',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            });
            await this.channelManager.postToChannel(this.fileSystemChannelId, root.obj);
            return root.obj;
        }
        const rootHash = rootDirectory[rootDirectory.length - 1].dataHash;
        return (await getObject(rootHash)) as PersistentFileSystemRoot;
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
                    'PersistentFileSystemRoot',
                    {
                        channelId: this.fileSystemChannelId
                    }
                );

                if (rootDirectory[0]) {
                    if (!this.persistedFileSystem) {
                        throw new Error('Module was not instantiated');
                    }
                    this.persistedFileSystem.updateRoot = (await getObject(
                        rootDirectory[0].dataHash
                    )) as PersistentFileSystemRoot;
                } else {
                    throw new Error('Module was not instantiated');
                }
                this.emit('updated');
            }
        });
    }
}
