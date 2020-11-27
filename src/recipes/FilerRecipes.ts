import {Recipe, RecipeRule} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        FileSystemDirectory: FileSystemDirectory;
        FileSystemFile: FileSystemFile;
        FileSystemRoot: FileSystemRoot
    }

    export interface FileSystemRoot {
        $type$: 'FileSystemRoot'
        content: FileSystemRootEntry
    }

    export interface FileSystemDirectoryEntry {
        mode: number,
        content: SHA256Hash<FileSystemDirectory | FileSystemFile>
    }

    export interface FileSystemRootEntry {
        mode: number,
        root: SHA256Hash<FileSystemDirectory>
    }

    export interface FileSystemFile {
        $type$: 'FileSystemFile';
        content: SHA256Hash<BLOB>;
    }

    export interface FileSystemDirectory {
        $type$: 'FileSystemDirectory';
        children: Map<string, FileSystemDirectoryEntry>;
    }

    export interface PlanResultTypes {
        '@module/createRootFileSystemDirectory': {
            args: any;
            result: UnversionedObjectResult<FileSystemRoot>;
        },
        '@module/updateRootFileSystemDirectory': {
            args: any;
            result: UnversionedObjectResult<FileSystemRoot>;
        };
    }
}

export const FileSystemRootEntryRule: RecipeRule[] = [
    {
        itemprop: 'mode',
        valueType: 'string'
    },
    {
        itemprop: 'root',
        referenceToObj: new Set(['FileSystemDirectory'])
    }
];

export const FilerFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemFile',
    rule: [
        {
            itemprop: 'content',
            referenceToBlob: true
        }
    ]
}

export const FilerDirectoryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemDirectory',
    rule: [
        {
            itemprop: 'children',
            valueType: 'Map'
        }
    ]
}

export const FileSystemRootRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemRoot',
    rule: [
        {
            itemprop: 'content',
            rule: FileSystemRootEntryRule
        }
    ]
}

const FilerRecipes: Recipe[] = [
    FilerDirectoryRecipe,
    FilerFileRecipe,
    FileSystemRootRecipe
]

export default FilerRecipes;