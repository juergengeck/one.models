import type {BLOB, Recipe} from 'one.core/lib/recipes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import type {SHA256Hash} from 'one.core/lib/util/type-checks';
import type {UnversionedObjectResult} from 'one.core/lib/storage';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        BlobCollection: BlobCollection;
        BlobDescriptor: BlobDescriptor;
    }

    export interface PlanResultTypes {
        '@module/createBlobCollection': {
            args: any;
            result: UnversionedObjectResult<BlobCollection>;
        };
    }
}

export interface BlobCollection {
    $type$: 'BlobCollection';
    name: string;
    blobs: SHA256Hash<BlobDescriptor>[];
}

export interface BlobDescriptor {
    $type$: 'BlobDescriptor';
    data: SHA256Hash<BLOB>;
    lastModified: number;
    name: string;
    size: number;
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Types
    type: string;
}

export const BlobCollection: Recipe = {
    $type$: 'Recipe',
    name: 'BlobCollection',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string'
        },
        {
            itemprop: 'blobs',
            referenceToObj: new Set(['BlobDescriptor']),
            list: ORDERED_BY.APP
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

const BlobRecipes: Recipe[] = [BlobCollection, BlobDescriptor];

export default BlobRecipes;
