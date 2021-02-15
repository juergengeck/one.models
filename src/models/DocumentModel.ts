import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {BLOB, DocumentInfo_1_1_0, SHA256Hash} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';

export type DocumentInfo = DocumentInfo_1_1_0;

/**
 * Saving the document in ONE as a BLOB and returning the reference for it.
 *
 * @param {ArrayBuffer} document - the document that is saved in ONE as a BLOB.
 * @returns {Promise<SHA256Hash<BLOB>>} The reference to the saved BLOB.
 */
async function saveDocumentAsBLOB(document: ArrayBuffer): Promise<SHA256Hash<BLOB>> {
    const minimalWriteStorageApiObj = {
        createFileWriteStream: createFileWriteStream
    } as WriteStorageApi;

    const stream = minimalWriteStorageApiObj.createFileWriteStream();
    stream.write(document);

    const blob = await stream.end();

    return blob.hash;
}

/**
 * Convert from one representation to model representation.
 *
 * @param {DocumentInfo} oneObject - the one object
 * @returns {ArrayBuffer} The corresponding model object
 */
async function convertFromOne(oneObject: DocumentInfo): Promise<ArrayBuffer> {
    let document: ArrayBuffer = {} as ArrayBuffer;
    const stream = Storage.createFileReadStream(oneObject.document);
    stream.onData.addListener((data: ArrayBuffer) => {
        document = data;
    });
    await stream.promise;

    return document;
}

/**
 * This model implements the possibility of adding a document into a journal
 * and keeping track of the list of the documents.
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
     * Create a new reference to a document.
     *
     * @param {ArrayBuffer} document - The document.
     * @param {DocumentInfo['mimeType']} mimeType
     */
    async addDocument(document: ArrayBuffer, mimeType: DocumentInfo['mimeType']): Promise<void> {
        const oneDocument = await saveDocumentAsBLOB(document);
        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'DocumentInfo',
            mimeType: mimeType,
            document: oneDocument
        });
    }

    /**
     * Getting all the documents stored in ONE.
     *
     * @returns {Promise<ObjectData<ArrayBuffer>[]>} - an array of documents.
     */
    async documents(): Promise<ObjectData<ArrayBuffer>[]> {
        const documents: ObjectData<ArrayBuffer>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType('DocumentInfo_1_1_0', {
            channelId: this.channelId
        });

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            const document = await convertFromOne(data);
            documents.push({...restObjectData, data: document});
        }

        return documents;
    }

    /**
     * Getting a document with a specific id.
     *
     * @param {string} id - the id of the document.
     * @returns {Promise<ObjectData<ArrayBuffer>>} the document.
     */
    async getDocumentById(id: string): Promise<ObjectData<ArrayBuffer>> {
        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            id,
            'DocumentInfo_1_1_0'
        );
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
