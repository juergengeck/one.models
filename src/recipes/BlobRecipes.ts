import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        BlobCollection: BlobCollection;
        BlobDescriptor: BlobDescriptor;
    }

    export interface BlobCollection {
        $type$: 'BlobCollection';
        name: string;
        blobs: SHA256Hash<BlobDescriptor>[];
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

    export interface PlanResultTypes {
        '@module/createBlobCollection': {
            args: any;
            result: UnversionedObjectResult<BlobCollection>;
        };
    }
}

export const BlobCollection: Recipe = {
    $type$: 'Recipe',
    name: 'BlobCollection',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'blobs',
            referenceToObj: new Set(['BlobDescriptor'])
        }
    ]
};

export const BlobDescriptor: Recipe = {
    $type$: 'Recipe',
    name: 'BlobDescriptor',
    rule: [
        {
            itemprop: 'data',
            referenceToBlob: true
        },
        {
            itemprop: 'lastModified',
            valueType: 'number'
        },
        {
            itemprop: 'name',
            valueType: 'string'
        },
        {
            // size in bytes
            itemprop: 'size',
            valueType: 'number'
        },
        {
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Types
            itemprop: 'type',
            valueType: 'string'
        }
    ]
};

// ######## Export recipes ########

const BlobRecipes: Recipe[] = [BlobCollection, BlobDescriptor];

export default BlobRecipes;
