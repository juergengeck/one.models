import {Recipe, RecipeRule} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        FilerDirectory: FilerDirectory;
        FilerFile: FilerFile;
    }

    export interface FilerMetaProps {
        path: string,
        mode: number,
        name: string
    }

    export interface FilerFile {
        $type$: 'FilerFile';
        meta: FilerMetaProps;
        content: SHA256Hash<BLOB>;
    }

    export interface FilerDirectory {
        $type$: 'FilerDirectory';
        meta: FilerMetaProps
        children: Map<string, SHA256Hash<FilerDirectory | FilerFile>>;
    }

    export interface PlanResultTypes {
        '@module/createRootFilerDirectory': {
            args: any;
            result: UnversionedObjectResult<FilerDirectory>;
        };
    }
}

export const FilerMetaPropsRule: RecipeRule[] = [
    {
      itemprop: 'path',
      valueType: 'string'
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

export const FilerFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FilerFile',
    rule: [
        {
            itemprop: 'meta',
            rule: FilerMetaPropsRule
        },
        {
            itemprop: 'content',
            referenceToBlob: true
        }
    ]
}

export const FilerDirectoryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FilerDirectory',
    rule: [
        {
            itemprop: 'meta',
            rule: FilerMetaPropsRule
        },
        {
            itemprop: 'children',
            valueType: 'Map'
        }
    ]
}

const FilerRecipes: Recipe[] = [
    FilerDirectoryRecipe,
    FilerFileRecipe,
]

export default FilerRecipes;