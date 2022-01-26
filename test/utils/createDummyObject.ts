import type {UnversionedObjectResult, VersionedObjectResult} from '@refinio/one.core/lib/storage';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {Recipe, Plan} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import {storeVersionedObject} from '@refinio/one.core/lib/storage-versioned-objects';

const DUMMY_PLAN_HASH =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        DummyObjectUnversioned: DummyObjectUnversioned;
    }
    export interface OneVersionedObjectInterfaces {
        DummyObjectVersioned: DummyObjectVersioned;
    }
    export interface OneIdObjectInterfaces {
        DummyObjectVersioned: Pick<DummyObjectVersioned, '$type$' | 'id'>;
    }
}

export interface DummyObjectUnversioned {
    $type$: 'DummyObjectUnversioned';
    data: string;
}

export interface DummyObjectVersioned {
    $type$: 'DummyObjectVersioned';
    id: string;
    data: string;
}

export const DummyObjectUnversionedRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DummyObjectUnversioned',
    rule: [
        {
            itemprop: 'data'
        }
    ]
};

export const DummyObjectVersionedRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DummyObjectVersioned',
    rule: [
        {
            itemprop: 'id',
            isId: true
        },
        {
            itemprop: 'data'
        }
    ]
};

export async function createDummyObjectUnversioned(
    data: string
): Promise<UnversionedObjectResult<DummyObjectUnversioned>> {
    return storeUnversionedObject({
        $type$: 'DummyObjectUnversioned',
        data
    });
}

export async function createDummyObjectVersioned(
    id: string,
    data: string
): Promise<VersionedObjectResult<DummyObjectVersioned>> {
    return storeVersionedObject(
        {
            $type$: 'DummyObjectVersioned',
            id,
            data
        },
        DUMMY_PLAN_HASH
    );
}

export const DummyObjectRecipes: Recipe[] = [
    DummyObjectUnversionedRecipe,
    DummyObjectVersionedRecipe
];
