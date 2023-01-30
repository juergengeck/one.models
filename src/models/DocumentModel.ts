import {readBlobAsArrayBuffer, storeArrayBufferAsBlob} from '@refinio/one.core/lib/storage-blob';
import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {Model} from './Model';

import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {AcceptedMimeType} from '../recipes/DocumentRecipes/DocumentRecipes_1_1_0';
import type {DocumentInfo_1_1_0} from '../recipes/DocumentRecipes/DocumentRecipes_1_1_0';
import type {DocumentInfo as DocumentInfo_1_0_0} from '../recipes/DocumentRecipes/DocumentRecipes_1_0_0';

export type DocumentInfo = DocumentInfo_1_1_0;

/**
 * This model implements the possibility of adding a document into a journal
 * and keeping track of the list of the documents.
 */
export default class DocumentModel extends Model {
    channelManager: ChannelManager;
    public static readonly channelId = 'document';
    private readonly disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        await this.channelManager.createChannel(DocumentModel.channelId);

        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    /**
     * Create a new reference to a document.
     *
     * @param document - The document.
     * @param mimeType
     * @param documentName
     * @param channelId - The default is DocumentModel.channelId
     */
    async addDocument(
        document: ArrayBuffer,
        mimeType: DocumentInfo['mimeType'],
        documentName: DocumentInfo['documentName'],
        channelId: string = DocumentModel.channelId
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const oneDocument = await storeArrayBufferAsBlob(document);
        await this.channelManager.postToChannel(channelId, {
            $type$: 'DocumentInfo_1_1_0',
            mimeType: mimeType,
            documentName: documentName,
            document: oneDocument.hash
        });
    }

    /**
     * Getting all the documents stored in ONE.
     *
     * @returns an array of documents.
     */
    async documents(): Promise<ObjectData<DocumentInfo_1_1_0>[]> {
        this.state.assertCurrentState('Initialised');

        const documentsData = (await this.channelManager.getObjects({
            types: ['DocumentInfo_1_1_0', 'DocumentInfo'],
            channelId: DocumentModel.channelId
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
     * returns iterator for DocumentInfo_1_1_0
     * @param queryOptions
     */
    async *documentsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<DocumentInfo_1_1_0>> {
        this.state.assertCurrentState('Initialised');

        for await (const document of this.channelManager.objectIteratorWithType('DocumentInfo', {
            ...queryOptions,
            channelId: DocumentModel.channelId
        })) {
            yield {
                ...document,
                data: {
                    document: document.data.document,
                    $type$: 'DocumentInfo_1_1_0',
                    /** any {@link DocumentInfo_1_0_0} was saved as a PDF in the past **/
                    mimeType: AcceptedMimeType.PDF,
                    documentName: ''
                },
                // This is already there from "...document" above, but for TypeScript we need to
                // recast the type of this property
                dataHash: document.dataHash as unknown as SHA256Hash<DocumentInfo_1_1_0>
            };
        }
        yield* this.channelManager.objectIteratorWithType('DocumentInfo_1_1_0', {
            ...queryOptions,
            channelId: DocumentModel.channelId
        });
    }

    /**
     * Getting a document with a specific id.
     *
     * @param id - the id of the document.
     * @returns the document.
     */
    async getDocumentById(id: string): Promise<ObjectData<DocumentInfo_1_1_0>> {
        this.state.assertCurrentState('Initialised');

        const documentsData = await this.channelManager.getObjects({
            id: id,
            types: ['DocumentInfo_1_1_0', 'DocumentInfo'],
            channelId: DocumentModel.channelId
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
     * @param oneObject - the one object
     * @returns The corresponding model object
     */
    async blobHashToArrayBuffer(oneObject: DocumentInfo): Promise<ArrayBuffer> {
        this.state.assertCurrentState('Initialised');
        return await readBlobAsArrayBuffer(oneObject.document);
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     * @param data
     */
    private async handleOnUpdated(
        id: string,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === DocumentModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
