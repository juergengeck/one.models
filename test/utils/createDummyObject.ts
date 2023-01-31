import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage-unversioned-objects';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {Recipe} from '@refinio/one.core/lib/recipes';
import type {VersionedObjectResult} from '@refinio/one.core/lib/storage-versioned-objects';
import {storeVersionedObject} from '@refinio/one.core/lib/storage-versioned-objects';

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
    return storeVersionedObject({
        $type$: 'DummyObjectVersioned',
        id,
        data
    });
}

export const DummyObjectRecipes: Recipe[] = [
    DummyObjectUnversionedRecipe,
    DummyObjectVersionedRecipe
];
