import type {BLOB, Recipe} from '@refinio/one.core/lib/recipes';
import {ORDERED_BY} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';

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
            itemtype: {type: 'string'}
        },
        {
            itemprop: 'blobs',
            itemtype: {
                type: 'array',
                item: {type: 'referenceToObj', allowedTypes: new Set(['BlobDescriptor'])}
            }
        }
    ]
};

export const BlobDescriptor: Recipe = {
    $type$: 'Recipe',
    name: 'BlobDescriptor',
    rule: [
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToBlob'}
        },
        {
            itemprop: 'lastModified',
            itemtype: {type: 'number'}
        },
        {
            itemprop: 'name',
            itemtype: {type: 'string'}
        },
        {
            // size in bytes
            itemprop: 'size',
            itemtype: {type: 'number'}
        },
        {
            // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Types
            itemprop: 'type',
            itemtype: {type: 'string'}
        }
    ]
};

const BlobRecipes: Recipe[] = [BlobCollection, BlobDescriptor];

export default BlobRecipes;
