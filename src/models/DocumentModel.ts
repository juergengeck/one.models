import EventEmitter from 'events';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {
    BLOB,
    DocumentInfo as DocumentInfo_1_0_0,
    DocumentInfo_1_1_0,
    OneUnversionedObjectTypes,
    Person,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';
import {AcceptedMimeType} from '../recipes/DocumentRecipes/DocumentRecipes_1_1_0';
import {OEvent} from '../misc/OEvent';
import {Model} from './Model';

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
 * This model implements the possibility of adding a document into a journal
 * and keeping track of the list of the documents.
 */
export default class DocumentModel extends EventEmitter implements Model {
    /**
     * Event emitted when document data is updated.
     */
    public onUpdated = new OEvent<(data?: ObjectData<OneUnversionedObjectTypes>) => void>();

    channelManager: ChannelManager;
    channelId: string;
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'document';
        this.channelManager = channelManager;
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
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
     * Create a new reference to a document.
     *
     * @param {ArrayBuffer} document - The document.
     * @param {DocumentInfo['mimeType']} mimeType
     * @param {DocumentInfo['documentName']} documentName
     */
    async addDocument(
        document: ArrayBuffer,
        mimeType: DocumentInfo['mimeType'],
        documentName: DocumentInfo['documentName']
    ): Promise<void> {
        const oneDocument = await saveDocumentAsBLOB(document);
        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'DocumentInfo_1_1_0',
            mimeType: mimeType,
            documentName: documentName,
            document: oneDocument
        });
    }

    /**
     * Getting all the documents stored in ONE.
     *
     * @returns {Promise<ObjectData<ArrayBuffer>[]>} - an array of documents.
     */
    async documents(queryOptions?: QueryOptions): Promise<ObjectData<DocumentInfo_1_1_0>[]> {
        const documentsData = (await this.channelManager.getObjects({
            ...queryOptions,
            types: ['DocumentInfo_1_1_0', 'DocumentInfo'],
            channelId: this.channelId
        })) as ObjectData<DocumentInfo_1_1_0 | DocumentInfo_1_0_0>[];

        return documentsData.map(
            (documentData: ObjectData<DocumentInfo_1_1_0 | DocumentInfo_1_0_0>) => {
                /** Update older versions of type {@link DocumentInfo_1_0_0} to {@link DocumentInfo_1_1_0} **/
                if (documentData.data.$type$ === 'DocumentInfo') {
                    documentData.data = {
                        document: documentData.data.document,
                        $type$: 'DocumentInfo_1_1_0',
                        /** any {@link DocumentInfo_1_0_0} was saved as a PDF in the past **/
                        mimeType: AcceptedMimeType.PDF,
                        documentName: ''
                    };
                    return documentData;
                } else {
                    return documentData;
                }
            }
        ) as ObjectData<DocumentInfo_1_1_0>[];
    }

    /**
     * Getting a document with a specific id.
     *
     * @param {string} id - the id of the document.
     * @returns {Promise<ObjectData<ArrayBuffer>>} the document.
     */
    async getDocumentById(id: string): Promise<ObjectData<DocumentInfo_1_1_0>> {
        const documentsData = await this.channelManager.getObjects({
            id: id,
            types: ['DocumentInfo_1_1_0', 'DocumentInfo'],
            channelId: this.channelId
        });

        /** if the list is empty, the object reference does not exist - getObjectWithTypeById behaviour **/
        if (documentsData.length === 0) {
            throw new Error('The referenced object does not exist');
        }

        /** it should always be only one object with the desired id **/
        const foundDocumentData = documentsData[0];

        /** Update older versions of type {@link DocumentInfo_1_0_0} to {@link DocumentInfo_1_1_0} **/
        if (foundDocumentData.data.$type$ === 'DocumentInfo') {
            foundDocumentData.data = {
                $type$: 'DocumentInfo_1_1_0',
                document: foundDocumentData.data.document,
                /** any {@link DocumentInfo_1_0_0} was saved as a PDF in the past **/
                mimeType: AcceptedMimeType.PDF,
                documentName: ''
            };
            return foundDocumentData as ObjectData<DocumentInfo_1_1_0>;
        }

        return foundDocumentData as ObjectData<DocumentInfo_1_1_0>;
    }

    /**
     * Convert from one representation to model representation.
     *
     * @param {DocumentInfo} oneObject - the one object
     * @returns {ArrayBuffer} The corresponding model object
     */
    async blobHashToArrayBuffer(oneObject: DocumentInfo): Promise<ArrayBuffer> {
        let document: ArrayBuffer = {} as ArrayBuffer;
        const stream = Storage.createFileReadStream(oneObject.document);
        stream.onData.addListener((data: ArrayBuffer) => {
            document = data;
        });
        await stream.promise;

        return document;
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
