import type {ChannelManager} from '../models';
import type PersistentFileSystem from './PersistentFileSystem';
import type {ObjectData} from '../models/ChannelManager';
import {platform} from '@refinio/one.core/lib/system/platform';
import {PLATFORMS} from '@refinio/one.core/lib/platforms';
import {AcceptedMimeType} from '../recipes/DocumentRecipes/DocumentRecipes_1_1_0';
import type {BLOB, OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type PersistentFilerModel from '../models/filer/PersistentFilerModel';
import {DocumentModel} from '../models';

export type AllowedChannel = {channelId: string; folder?: string};

/**
 * PWA connector between {@link ChannelManager} and {@link PersistentFileSystem}. This module allows the saving of
 * new channels items into the {@link PersistentFileSystem}.
 */
export class PWAConnector {
    private channelManager: ChannelManager;
    private persistedFileSystem: PersistentFileSystem;
    private disconnect: (() => void) | undefined;

    /**
     * This field allows only a restricted pair of channels. This also allows custom naming of the viewing folder for the
     * specific folder. If no name is passed into the {@link AllowedChannel.folder}, the Object's $type$ will be the name.
     * @private
     */
    private allowedChannels: AllowedChannel[];

    constructor(
        channelManager: ChannelManager,
        persistedFileSystem: PersistentFileSystem,
        allowedChannels: AllowedChannel[]
    ) {
        // Accepted because of TS2367: This condition will always return 'true' since the types '"node"' and '"browser"' have no overlap.
        // @ts-ignore
        if (platform !== PLATFORMS.BROWSER) {
            throw new Error('Error: this module can be used only on Browser environment.');
        }

        this.channelManager = channelManager;
        this.persistedFileSystem = persistedFileSystem;
        this.allowedChannels = allowedChannels;
    }

    async init() {
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }
    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        const isChannelIdAllowed = this.allowedChannels.find(item => item.channelId === id);

        if (isChannelIdAllowed && data !== undefined) {
            const objectData = data.data;
            const viewingFolder = isChannelIdAllowed.folder
                ? isChannelIdAllowed.folder
                : objectData.$type$;
            const exists = await this.persistedFileSystem.exists(`/${viewingFolder}`);

            if (!exists) {
                await this.persistedFileSystem.createDir(`/${viewingFolder}`);
            }
            try {
                switch (objectData.$type$) {
                    // DocumentInfo is a special case because it already contains the BLOB and has a file name attached to it
                    case 'DocumentInfo_1_1_0': {
                        await this.persistedFileSystem.createFile(
                            `/${viewingFolder}`,
                            objectData.document,
                            objectData.documentName
                        );
                        break;
                    }
                    default: {
                        await this.persistedFileSystem.createFile(
                            `/${viewingFolder}`,
                            // dataHash is actually the BLOB of the object
                            data.dataHash as unknown as SHA256Hash<BLOB>,
                            `${objectData.$type$}-${data.dataHash}`
                        );
                        break;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
}

/**
 * Filer connector between {@link PersistentFileSystem} and {@link ChannelManager}. This module allows the saving of
 * new added files into the {@link DocumentModel} channel.
 */
export class FilerConnector {
    private channelManager: ChannelManager;
    private persistedFileSystem: PersistentFileSystem | undefined;
    private persistentFilerModel: PersistentFilerModel;
    private disconnect: (() => void) | undefined;
    private documentModel: DocumentModel;

    constructor(
        channelManager: ChannelManager,
        persistentFilerModel: PersistentFilerModel,
        documentModel: DocumentModel
    ) {
        // Accepted because of TS2367: This condition will always return 'true' since the types '"node"' and '"browser"' have no overlap.
        // @ts-ignore
        if (platform !== PLATFORMS.NODE_JS) {
            throw new Error('Error: this module can be used only on NODEJS environment.');
        }

        this.documentModel = documentModel;
        this.channelManager = channelManager;
        this.persistentFilerModel = persistentFilerModel;
    }

    async init() {
        this.persistedFileSystem = this.persistentFilerModel.fileSystem;
        this.disconnect = this.persistedFileSystem.onFilePersisted(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Handler function for the 'onFilePersisted' event
     * @param {fileHash: SHA256Hash<BLOB>; fileName: string} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(data: {
        fileHash: SHA256Hash<BLOB>;
        fileName: string;
    }): Promise<void> {
        const fileType = data.fileName
            .slice(((data.fileName.lastIndexOf('.') - 1) >>> 0) + 2)
            .toLowerCase();
        let mimeType: AcceptedMimeType | undefined = undefined;

        // ignore the empty file hash - don't added it into the channel
        if (data.fileHash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
            return;
        }

        if (fileType === 'png') {
            mimeType = AcceptedMimeType.PNG;
        }

        if (['jpg', 'jpeg'].includes(fileType)) {
            mimeType = AcceptedMimeType.JPEG;
        }

        if (fileType === 'pdf') {
            mimeType = AcceptedMimeType.PDF;
        }

        if (mimeType !== undefined) {
            await this.channelManager.postToChannel(DocumentModel.channelId, {
                $type$: 'DocumentInfo_1_1_0',
                mimeType: mimeType as string,
                documentName: data.fileName,
                document: data.fileHash
            });
        }
    }
}