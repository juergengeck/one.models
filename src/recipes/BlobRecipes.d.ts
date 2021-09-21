import type {BLOB, Recipe} from 'one.core/lib/recipes';
import type {SHA256Hash} from 'one.core/lib/util/type-checks';
import type {UnversionedObjectResult} from 'one.core/lib/storage';
declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        BlobCollection: BlobCollection;
        BlobDescriptor: BlobDescriptor;
    }
    interface PlanResultTypes {
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
    type: string;
}
export declare const BlobCollection: Recipe;
export declare const BlobDescriptor: Recipe;
declare const BlobRecipes: Recipe[];
export default BlobRecipes;
//# sourceMappingURL=BlobRecipes.d.ts.map
