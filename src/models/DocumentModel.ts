import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {BLOB, DocumentInfo as OneDocumentInfo, SHA256Hash} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';

/**
 * This represents a document but not the content,
 */
export type DocumentInfo = ArrayBuffer;

/**
 * Convert from model representation to one representation.
 *
 * @param {DocumentInfo} modelObject - the model object
 * @returns {OneDocumentInfo} The corresponding one object
 */
function convertToOne(modelObject: SHA256Hash<BLOB>): OneDocumentInfo {
    // Create the resulting object
    return {
        $type$: 'DocumentInfo',
        document: modelObject
    };
}

/**
 * Convert from one representation to model representation.
 *
 * @param {OneDocumentInfo} oneObject - the one object
 * @returns {DocumentInfo} The corresponding model object
 */
async function convertFromOne(oneObject: OneDocumentInfo): Promise<DocumentInfo> {
    // Create the new ObjectData item
    let document: DocumentInfo = {} as DocumentInfo;
    const stream = Storage.createFileReadStream(oneObject.document);
    stream.onData.addListener(data => {
        document = data;
    });
    await stream.promise;

    return document;
}

/**
 * This model implements the possibility of adding a document into a journal
 * and keeping track of the list of the documents
 */
export default class DocumentModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'document';
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Create a new document.
     *
     * @param {File} document - The data of the document
     */
    async addDocument(document: DocumentInfo): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        const stream = minimalWriteStorageApiObj.createFileWriteStream();
        stream.write(document);

        const blob = await stream.end();

        await this.channelManager.postToChannel(this.channelId, convertToOne(blob.hash));
    }

    async documents(): Promise<ObjectData<DocumentInfo>[]> {
        const documents: ObjectData<DocumentInfo>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'DocumentInfo'
        );

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            console.log("oneObject: ", oneObject);
            const {data, ...restObjectData} = oneObject;
            const document = await convertFromOne(data);
            documents.push({...restObjectData, data: document});
        }

        console.log("For testing: ", documents.length);
        console.log("Documents content: ", documents);
        return documents;
    }

    async getDocumentById(id: string): Promise<ObjectData<DocumentInfo>> {
        const {data, ...restObjectData} = (
            await this.channelManager.getObjectWithTypeById(this.channelId, id, 'DocumentInfo')
        )[0];
        const document = await convertFromOne(data);
        return {...restObjectData, data: document};
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
