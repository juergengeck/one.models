import {Recipe, RecipeRule} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        PersistentFileSystemDirectory: PersistentFileSystemDirectory;
        PersistentFileSystemFile: PersistentFileSystemFile;
        PersistentFileSystemRoot: PersistentFileSystemRoot;
    }

    /**
     * @global
     * Starting point in the persisted file system. Points to a root entry.
     */
    export interface PersistentFileSystemRoot {
        $type$: 'PersistentFileSystemRoot';
        root: PersistentFileSystemRootEntry;
    }

    /**
     * @global
     * Directory entry structure for the Persisted File System Directory (What the directory contains)
     */
    export interface PersistentFileSystemDirectoryEntry {
        mode: number;
        content: SHA256Hash<PersistentFileSystemDirectory | PersistentFileSystemFile>;
    }

    /**
     * @global
     * Part of the PersistentFileSystemRoot that preservers the root's mode and his reference
     */
    export interface PersistentFileSystemRootEntry {
        mode: number;
        entry: SHA256Hash<PersistentFileSystemDirectory>;
    }

    /**
     * @global
     * Persisted file system file structure
     */
    export interface PersistentFileSystemFile {
        $type$: 'PersistentFileSystemFile';
        content: SHA256Hash<BLOB>;
    }

    /**
     * @global
     * Persisted file system directory structure
     */
    export interface PersistentFileSystemDirectory {
        $type$: 'PersistentFileSystemDirectory';
        children: Map<string, PersistentFileSystemDirectoryEntry>;
    }

    /**
     * Plans to create & update the root directory
     */
    export interface PlanResultTypes {
        '@module/persistentFileSystemCreateRoot': {
            args: any;
            result: UnversionedObjectResult<PersistentFileSystemRoot>;
        };
        '@module/persistentFileSystemUpdateRoot': {
            args: any;
            result: UnversionedObjectResult<PersistentFileSystemRoot>;
        };
        '@module/persistentFileSystemSymlink': {
            args: any;
            result: UnversionedObjectResult<BlobDescriptor>
        }
    }
}
/**
 * the main root directory that points to a FileSystemDirectory and his mode
 * @type {({valueType: string, itemprop: string} | {referenceToObj: Set<string>, itemprop: string})[]}
 */
export const PersistentFileSystemRootEntryRule: RecipeRule[] = [
    {
        itemprop: 'mode',
        valueType: 'number'
    },
    {
        itemprop: 'entry',
        referenceToObj: new Set(['PersistentFileSystemDirectory'])
    }
];
/**
 * used to represent BLOBs
 * @type {{name: string, rule: {referenceToBlob: boolean, itemprop: string}[], $type$: string}}
 */
export const PersistentFileSystemFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'PersistentFileSystemFile',
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
export const PersistentFileSystemDirectoryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'PersistentFileSystemDirectory',
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
export const PersistentFileSystemRootRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'PersistentFileSystemRoot',
    rule: [
        {
            itemprop: 'root',
            rule: PersistentFileSystemRootEntryRule
        }
    ]
};

const PersistentFileSystemRecipes: Recipe[] = [
    PersistentFileSystemDirectoryRecipe,
    PersistentFileSystemFileRecipe,
    PersistentFileSystemRootRecipe
];

export default PersistentFileSystemRecipes;
