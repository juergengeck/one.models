/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {
    BLOB,
    PersistentFileSystemDirectory,
    PersistentFileSystemFile,
    PersistentFileSystemDirectoryEntry,
    OneObjectTypes,
    SHA256Hash,
    PersistentFileSystemRoot
} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {serializeWithType} from 'one.core/lib/util/promise';
import {
    FileSystemDirectory,
    FileSystemDirectoryEntry,
    FileSystemFile,
    IFileSystem
} from './IFileSystem';

/**
 * This represents a FileSystem Structure that can create/open directories or files and persisting them in one.
 * This class is using FileSystemRoot, FileSystemDirectory & FileSystemFile recipes in order
 * to accomplish this FileSystem structure.
 */
export default class PersistentFileSystem implements IFileSystem {
    /** the root of the file system **/
    private rootDirectoryContent: PersistentFileSystemRoot['root'];

    /**
     *
     * @param {SHA256Hash<PersistentFileSystemDirectory>} rootDirectory
     */
    public constructor(rootDirectory: PersistentFileSystemRoot) {
        this.rootDirectoryContent = rootDirectory.root;
    }

    /**
     *
     * @type {((rootHash: SHA256Hash<PersistentFileSystemDirectory>) => void) | null}
     */
    public onRootUpdate:
        | ((rootHash: SHA256Hash<PersistentFileSystemDirectory>) => void)
        | null = null;

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} fileHash
     * @param {string} fileName
     * @param {number} fileMode
     * @returns {Promise<PersistentFileSystemDirectory>}
     */
    public async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FileSystemFile> {
        await serializeWithType('FileSystemCreateLock', async () => {
            /** the directory where you want to save the file **/
            const targetDirectory = await this.openPersistedDir(directoryPath);
            const doesFileExists = await this.openPersistedDir(
                PersistentFileSystem.pathJoin(directoryPath, fileName)
            );

            if (doesFileExists) {
                throw new Error('Error: a directory with the same path already exists.');
            }

            if (!targetDirectory) {
                throw new Error('Error: the given directory path could not be found.');
            }

            const savedFile = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'PersistentFileSystemFile',
                    content: fileHash
                }
            );
            /** set the new file **/
            targetDirectory.children.set(
                `/${fileName}`,
                this.buildFileSystemDirectoryEntry(savedFile.hash)
            );

            /** update the directory **/
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                targetDirectory
            );
            const updatedTargetDirectoryHash = await calculateHashOfObj(targetDirectory);
            /** if the file is added on root, don't go recursive on the tree **/
            if (directoryPath === '/') {
                /** update the channel with the updated root directory **/
                if (this.onRootUpdate) {
                    await this.onRootUpdate(updatedTargetDirectoryHash);
                }
            } else {
                /** update the nodes above **/
                await this.updateFileSystemTree(
                    updatedTargetDirectoryHash,
                    PersistentFileSystem.getParentDirectoryFullPath(directoryPath),
                    PersistentFileSystem.pathJoin(
                        '/',
                        PersistentFileSystem.getLastItem(directoryPath)
                    )
                );
            }
        });

        return {
            mode: fileMode,
            content: fileHash
        };
    }

    /**
     * Checks if a file exists or not
     * @param filePath
     */
    public async openFile(filePath: string): Promise<FileSystemFile | undefined> {
        const foundDirectoryEntry = await this.search(filePath);
        if (!foundDirectoryEntry) {
            return undefined;
        }
        const foundDirectoryEntryValue = await getObject(foundDirectoryEntry.content);

        if (!PersistentFileSystem.isFile(foundDirectoryEntryValue)) {
            return undefined;
        }
        return {
            mode: foundDirectoryEntry.mode,
            content: foundDirectoryEntryValue.content
        };
    }

    /**
     * @param directoryPath
     * @param dirName
     * @param dirMode
     */
    public async createDir(
        directoryPath: string,
        dirName: string,
        dirMode = 0o0100777
    ): Promise<FileSystemDirectory> {
        const persistedResult = await serializeWithType('FileSystemCreateLock', async () => {
            const pathExists = await this.openPersistedDir(
                PersistentFileSystem.pathJoin(directoryPath, dirName)
            );
            const targetDirectory = await this.openPersistedDir(directoryPath);

            if (pathExists) {
                throw new Error('Error: the path already exists.');
            }

            if (!targetDirectory) {
                throw new Error('Error: the given directory path could not be found.');
            }

            const newDirectory = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'PersistentFileSystemDirectory',
                    children: new Map()
                }
            );
            const newDirectoryHash = await calculateHashOfObj(newDirectory.obj);
            /** Intentionally the same hash because this directory was created now **/
            await this.updateFileSystemTree(
                newDirectoryHash,
                directoryPath,
                PersistentFileSystem.pathJoin('/', dirName)
            );
            return newDirectory.obj;
        });
        return await PersistentFileSystem.transformPersistedDirectoryToFileSystemDirectory(
            persistedResult
        );
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<PersistentFileSystemDirectory | undefined>}
     */
    public async openDir(path: string): Promise<FileSystemDirectory | undefined> {
        const foundDirectoryEntry = await this.search(path);
        if (!foundDirectoryEntry) {
            return undefined;
        }
        const foundDirectoryEntryValue = await getObject(foundDirectoryEntry.content);

        if (!PersistentFileSystem.isDir(foundDirectoryEntryValue)) {
            return undefined;
        }

        return await PersistentFileSystem.transformPersistedDirectoryToFileSystemDirectory(
            foundDirectoryEntryValue
        );
    }

    /**
     *
     * @param rootDirectory
     */
    public set updateRoot(rootDirectory: PersistentFileSystemRoot) {
        this.rootDirectoryContent = rootDirectory.root;
    }

    // ---------------------------------------- Private ----------------------------------------

    /**
     *
     * @param {PersistentFileSystemDirectory} dir
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async transformPersistedDirectoryToFileSystemDirectory(
        dir: PersistentFileSystemDirectory
    ): Promise<FileSystemDirectory> {
        const simplifiedMap = new Map<string, FileSystemDirectoryEntry>();
        for (let [key, value] of dir.children) {
            const object = await getObject(value.content);
            if (PersistentFileSystem.isDir(object)) {
                simplifiedMap.set(key, {mode: value.mode});
            } else if (PersistentFileSystem.isFile(object)) {
                simplifiedMap.set(key, {mode: value.mode, content: object.content});
            }
        }
        return {children: simplifiedMap};
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<PersistentFileSystemDirectory | undefined>}
     * @private
     */
    private async openPersistedDir(
        path: string
    ): Promise<PersistentFileSystemDirectory | undefined> {
        const foundDirectoryEntry = await this.search(path);
        if (!foundDirectoryEntry) {
            return undefined;
        }
        const foundDirectoryEntryValue = await getObject(foundDirectoryEntry.content);

        if (!PersistentFileSystem.isDir(foundDirectoryEntryValue)) {
            return undefined;
        }

        return foundDirectoryEntryValue;
    }

    private buildFileSystemDirectoryEntry(
        content: SHA256Hash<PersistentFileSystemDirectory | PersistentFileSystemFile>,
        mode = 0o0100777
    ): PersistentFileSystemDirectoryEntry {
        return {
            content,
            mode
        };
    }

    /**
     * This will update the directory chain recursively starting from the directory you just updated.
     * @param {SHA256Hash<PersistentFileSystemDirectory>} updatedCurrentDirectoryHash
     * @param {string} updateToPath - this gets consumed with every recursive call
     * @param {string} directorySimplePath - NOT the full path, e.g /dir1
     * @returns {Promise<void>}
     * @private
     */
    private async updateFileSystemTree(
        updatedCurrentDirectoryHash: SHA256Hash<PersistentFileSystemDirectory>,
        updateToPath: string,
        directorySimplePath: string
    ): Promise<void> {
        /** get his parent directory **/
        const currentDirectoryParent = await this.openPersistedDir(updateToPath);
        /** check if the parent directory exists**/
        if (currentDirectoryParent) {
            /** locate the outdated current directory hash in the parent's children **/
            currentDirectoryParent.children.set(
                directorySimplePath,
                this.buildFileSystemDirectoryEntry(updatedCurrentDirectoryHash)
            );
            /** save the parent **/
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                currentDirectoryParent
            );
            /** get the updated parent hash **/
            const updatedCurrentDirectoryParent = await calculateHashOfObj(currentDirectoryParent);
            const parentDirectoryPath = PersistentFileSystem.getParentDirectoryFullPath(
                updateToPath
            );

            /** if its not root **/
            if (updateToPath !== '/') {
                await this.updateFileSystemTree(
                    updatedCurrentDirectoryParent,
                    parentDirectoryPath,
                    PersistentFileSystem.pathJoin(
                        '/',
                        PersistentFileSystem.getLastItem(updateToPath)
                    )
                );
            } else {
                /** update the channel with the updated root directory **/
                if (this.onRootUpdate) {
                    await this.onRootUpdate(await calculateHashOfObj(currentDirectoryParent));
                }
            }
        }
    }

    /**
     * @param {string} givenPath - this gets consumed from the start
     * @param {SHA256Hash<PersistentFileSystemDirectory | PersistentFileSystemFile>} parentDirectoryHash
     * @returns {Promise<PersistentFileSystemDirectory | PersistentFileSystemFile | undefined>}
     * @private
     */
    private async search(
        givenPath: string,
        parentDirectoryHash: SHA256Hash<
            PersistentFileSystemDirectory | PersistentFileSystemFile
        > = this.rootDirectoryContent.entry
    ): Promise<PersistentFileSystemDirectoryEntry | undefined> {
        /** get the top level directory **/
        const parentDirectory = await getObject(parentDirectoryHash);

        if (givenPath === '/') {
            return {mode: this.rootDirectoryContent.mode, content: this.rootDirectoryContent.entry};
        }

        /** if the given path it's not the root but it's a final path, e.g '/dir1' **/
        if (givenPath !== '/' && PersistentFileSystem.hasFoldersAboveExceptRoot(givenPath)) {
            if (PersistentFileSystem.isDir(parentDirectory)) {
                const child = parentDirectory.children.get(givenPath);
                if (child) {
                    return child;
                }
            }
        }

        /** if it's not a final path to search for, get the first folder in path **/
        const desiredPathInRoot = PersistentFileSystem.getFirstFolderAfterFirstSlash(givenPath);

        /** if the top level entity is a directory. Note that if it's a file and it's not the final path, it's an error **/
        if (PersistentFileSystem.isDir(parentDirectory)) {
            /** get his child **/
            const foundDirectory = parentDirectory.children.get(`/${desiredPathInRoot}`);
            if (foundDirectory) {
                /** consume the path from the start **/
                const nextPath = givenPath.replace(`/${desiredPathInRoot}`, '');
                return await this.search(nextPath, foundDirectory.content);
            } else {
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Get full path of the last directory's parent
     * E.g /dir1/dir2/dir3. Call this function will result in /dir1/dir2
     * @param {string} givenPath
     * @returns {string}
     * @private
     */
    private static getParentDirectoryFullPath(givenPath: string): string {
        const regex = new RegExp('/[^/]*$');
        let res = givenPath.replace(regex, '/');
        if (res !== '/') {
            return res.substring(0, res.length - 1);
        }
        return res;
    }

    /**
     * Append paths
     * @param {string} pathToJoin
     * @param {string} path
     * @returns {string}
     * @private
     */
    private static pathJoin(pathToJoin: string, path: string): string {
        return pathToJoin === '/' ? `${pathToJoin}${path}` : `${pathToJoin}/${path}`;
    }

    /**
     * Checks if the path is a final path, e.g /dir1 will return true
     * @param {string} path
     * @returns {boolean}
     * @private
     */
    private static hasFoldersAboveExceptRoot(path: string): boolean {
        return path.lastIndexOf('/') === 0;
    }

    /**
     *
     * @param {OneObjectTypes} oneObject
     * @returns {caughtObject is FileSystemDirectory}
     * @private
     */
    private static isDir(oneObject: OneObjectTypes): oneObject is PersistentFileSystemDirectory {
        return oneObject.$type$ === 'PersistentFileSystemDirectory';
    }

    /**
     *
     * @param {OneObjectTypes} oneObject
     * @returns {caughtObject is FileSystemFile}
     * @private
     */
    private static isFile(oneObject: OneObjectTypes): oneObject is PersistentFileSystemFile {
        return oneObject.$type$ === 'PersistentFileSystemFile';
    }

    /**
     * Retrieves the last item of path
     * @param {string} path
     * @private
     */
    private static getLastItem(path: string) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /**
     * Retrieves the very first entry after the first '/' (root) -> e.g '/dir1/dir2/dir3' will return dir1
     * @param {string} path
     * @returns {string}
     * @private
     */
    private static getFirstFolderAfterFirstSlash(path: string): string {
        const splitedPath: string[] = path.split('/');
        if (splitedPath[0] === '') {
            return splitedPath.splice(1, splitedPath.length)[0];
        } else {
            return splitedPath[0];
        }
    }
}
