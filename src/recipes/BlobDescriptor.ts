
declare module '@OneCoreTypes' {

    export interface OneUnversionedObjectInterfaces {
        BlobDescriptor: BlobDescriptor;
    }

    export interface BlobDescriptor {
        $type$: 'BlobDescriptor';
        name: string;
        sizeInBytes: number;
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Types
        mimeType: string;
        data: SHA256Hash<BLOB>;
    }
}
