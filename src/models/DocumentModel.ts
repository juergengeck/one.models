import EventEmitter from 'events';
import {SHA256Hash} from '@OneCoreTypes';

/**
 * This represents a document but not the content,
 */
export type DocumentInfo = {
    date: Date;
    hash: SHA256Hash; // This is the hash of the files object
};

/**
 * This model implements a document storage that stores the time of creation.
 */
export default class DocumentModel extends EventEmitter {
    constructor() {
        super();
        this.documentList = [];
    }

    /**
     * Create a new document.
     *
     * @param {string} data - The data of the document
     */
    async addDocument(data: Buffer): Promise<void> {
        // Write the data to storage
        /*this.documentList.push({
            date: new Date(),
            hash: '0123456789012345678901234567890123456789012345678901234567891234'
        });*/
        this.emit('updated');
    }

    /** Get a list of responses. */
    async documents(): Promise<DocumentInfo[]> {
        return [...this.documentList].sort((a, b) => {
            return b.date.getTime() - a.date.getTime();
        });
    }

    /**
     * Returns the file content.
     *
     * TODO: implement when we know how to represent the content
     *
     * @param {SHA256Hash} hash -  The hash of the file.
     */
    async getDocumentContent(hash: SHA256Hash): Promise<any> {
        return null;
    }

    private readonly documentList: DocumentInfo[]; // List of measurements. Will be stored in one instance later
}
