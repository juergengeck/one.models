import {Recipe, RecipeRule} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        FileSystemDirectory: FileSystemDirectory;
        FileSystemFile: FileSystemFile;
        FileSystemRoot: FileSystemRoot;
    }

    export interface FileSystemRoot {
        $type$: 'FileSystemRoot';
        root: FileSystemRootEntry;
    }

    export interface FileSystemDirectoryEntry {
        mode: number;
        content: SHA256Hash<FileSystemDirectory | FileSystemFile>;
    }

    export interface FileSystemRootEntry {
        mode: number;
        entry: SHA256Hash<FileSystemDirectory>;
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
        '@module/fileSystemCreateRoot': {
            args: any;
            result: UnversionedObjectResult<FileSystemRoot>;
        };
        '@module/fileSystemUpdateRoot': {
            args: any;
            result: UnversionedObjectResult<FileSystemRoot>;
        };
    }
}
/**
 * the main root directory that points to a FileSystemDirectory and his mode
 * @type {({valueType: string, itemprop: string} | {referenceToObj: Set<string>, itemprop: string})[]}
 */
export const FileSystemRootEntryRule: RecipeRule[] = [
    {
        itemprop: 'mode',
        valueType: 'string'
    },
    {
        itemprop: 'entry',
        referenceToObj: new Set(['FileSystemDirectory'])
    }
];
/**
 * used to represent BLOBs
 * @type {{name: string, rule: {referenceToBlob: boolean, itemprop: string}[], $type$: string}}
 */
export const FilerFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemFile',
    rule: [
        {
            itemprop: 'content',
            referenceToBlob: true
        }
    ]
};

/**
 * the children field is Map<string, FileSystemDirectoryEntry> where string is the simple path e.g '/dir1' in the current directory
 * @type {{name: string, rule: {valueType: string, itemprop: string}[], $type$: string}}
 */
export const FilerDirectoryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemDirectory',
    rule: [
        {
            itemprop: 'children',
            valueType: 'Map'
        }
    ]
};

/**
 * the main data structure for the root entry
 * @type {{name: string, rule: {rule: RecipeRule[], itemprop: string}[], $type$: string}}
 */
export const FileSystemRootRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'FileSystemRoot',
    rule: [
        {
            itemprop: 'root',
            rule: FileSystemRootEntryRule
        }
    ]
};

const FileSystemRecipes: Recipe[] = [FilerDirectoryRecipe, FilerFileRecipe, FileSystemRootRecipe];

export default FileSystemRecipes;
