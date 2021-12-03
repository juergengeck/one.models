import type {UnversionedObjectResult} from "@refinio/one.core/lib/storage";
import {storeUnversionedObject} from "@refinio/one.core/lib/storage-unversioned-objects";
import type {Recipe} from "@refinio/one.core/lib/recipes";

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        DummyObjectUnversioned: DummyObjectUnversioned;
    }
}

export interface DummyObjectUnversioned {
    data: string
}

export const DummyObjectUnversionedRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DummyObjectUnversioned',
    rule: [
        {
            itemprop: 'data'
        }
    ]
}

export async function createDummyObjectUnversioned(data: string): Promise<UnversionedObjectResult<DummyObjectUnversioned>> {
    return storeUnversionedObject({
        $type$: 'DummyObjectUnversioned',
        data
    });
}

export const DummyObjectRecipes: Recipe[] = [DummyObjectUnversionedRecipe];
