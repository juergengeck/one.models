import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {BLOB, DocumentInfo as OneDocumentInfo, SHA256Hash} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';

/**
 * This represents a document.
 */
export type DocumentInfo = ArrayBuffer;

/**
 * Convert from model representation to one representation.
 *
 * @param {DocumentInfo} modelObject - the model object
 * @returns {Promise<OneDocumentInfo>} The corresponding one object
 */
async function convertToOne(modelObject: DocumentInfo): Promise<OneDocumentInfo> {
    // Create the resulting object
    const documentReference = await saveDocumentAsBLOB(modelObject);

    return {
        $type$: 'DocumentInfo',
        document: documentReference
    };
}

/**
 * Saving the document in ONE as a BLOB and returning the reference for it.
 *
 * @param {DocumentInfo} document - the document that is saved in ONE as a BLOB.
 * @returns {Promise<SHA256Hash<BLOB>>} The reference to the saved BLOB.
 */
async function saveDocumentAsBLOB(document: DocumentInfo): Promise<SHA256Hash<BLOB>> {
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
 * @param {OneDocumentInfo} oneObject - the one object
 * @returns {DocumentInfo} The corresponding model object
 */
async function convertFromOne(oneObject: OneDocumentInfo): Promise<DocumentInfo> {
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
     * @param {DocumentInfo} document - The document.
     */
    async addDocument(document: DocumentInfo): Promise<void> {
        const oneDocument = await convertToOne(document);
        await this.channelManager.postToChannel(this.channelId, oneDocument);
    }

    /**
     * Getting all the documents stored in ONE.
     *
     * @returns {Promise<ObjectData<DocumentInfo>[]>} - an array of documents.
     */
    async documents(): Promise<ObjectData<DocumentInfo>[]> {
        const documents: ObjectData<DocumentInfo>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType('DocumentInfo', {
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
     * @returns {Promise<ObjectData<DocumentInfo>>} the document.
     */
    async getDocumentById(id: string): Promise<ObjectData<DocumentInfo>> {
        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            id,
            'DocumentInfo'
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
