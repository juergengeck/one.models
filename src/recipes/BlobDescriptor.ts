
declare module '@OneCoreTypes' {

    export interface OneUnversionedObjectInterfaces {
        BlobCollection: BlobCollection;
        BlobDescriptor: BlobDescriptor;
    }

    export interface BlobCollection {
        $type$: 'BlobCollection';
        name: string;
        blobs: BlobDescriptor[];
    }

    export interface BlobDescriptor {
        $type$: 'BlobDescriptor';
        data: SHA256Hash<BLOB>;
        // unixtimestamp
        lastModified: number;
        name: string;
        size: number;
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Types
        type: string;
    }
}
