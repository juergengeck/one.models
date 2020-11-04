import {Recipe, RecipeRule} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        FilerDirectory: FilerDirectory;
    }

    export interface FileRule {
        BLOB: SHA256Hash<BLOB>;
        mode: number;
        name: string;
    }

    export interface FilerDirectory {
        $type$: 'FilerDirectory';
        path: string;
        files: FileRule[];
        children: SHA256Hash<FilerDirectory>[];
    }

    export interface PlanResultTypes {
        '@module/createRootFilerDirectory': {
            args: any;
            result: UnversionedObjectResult<FilerDirectory>;
        };
    }
}

export const FileRule: RecipeRule[] = [
    {
        itemprop: 'BLOB',
        referenceToBlob: true
    },
    {
        itemprop: 'mode',
        valueType: 'string'
    },
    {
        itemprop: 'name',
        valueType: 'string'
    }
];

export const FilerDirectoryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FilerDirectory',
    rule: [
        {
            itemprop: 'path',
            valueType: 'string'
        },
        {
            itemprop: 'files',
            list: ORDERED_BY.ONE,
            rule: FileRule
        },
        {
            itemprop: 'children',
            referenceToObj: new Set(['FilerDirectory']),
            list: ORDERED_BY.ONE
        }
    ]
}

const FilerRecipes: Recipe[] = [
    FilerDirectoryRecipe
]

export default FilerRecipes;