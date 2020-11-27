/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {
    BLOB,
    FileSystemDirectory,
    FileSystemFile,
    FileSystemDirectoryEntry,
    OneObjectTypes,
    SHA256Hash,
    FileSystemRoot
} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {serializeWithType} from 'one.core/lib/util/promise';

/**
 * @type {RegExp}
 */
const isNameAllowed = new RegExp('^[^\\\\]+$');

/**
 * This represents a FileSystem Structure that can create/open directories or files and persisting them in one.
 * This class is using FileSystemRoot, FileSystemDirectory & FileSystemFile recipes in order
 * to accomplish this FileSystem structure.
 */
export default class FileSystem {
    /** the root of the file system **/
    private rootDirectoryContent: FileSystemRoot['content'];

    /**
     *
     * @param {SHA256Hash<FileSystemDirectory>} rootDirectory
     */
    public constructor(rootDirectory: FileSystemRoot) {
        this.rootDirectoryContent = rootDirectory.content;
    }

    /**
     *
     * @type {((rootHash: SHA256Hash<FileSystemDirectory>) => void) | null}
     */
    public onRootUpdate: ((rootHash: SHA256Hash<FileSystemDirectory>) => void) | null = null;

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} fileHash
     * @param {string} fileName
     * @param {number} fileMode
     * @returns {Promise<FileSystemDirectory>}
     */
    public async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FileSystemDirectory> {
        /** check if it contains '\\' characters (win32) **/
        FileSystem.checkIfNameIsAllowed(fileName);

        return await serializeWithType('actionLock', async () => {
            /** the directory where you want to save the file **/
            const targetDirectory = await this.openDir(directoryPath);
            const doesFileExists = await this.openDir(FileSystem.pathJoin(directoryPath, fileName));
            /** check if the target directory exists and file does not **/
            if (targetDirectory && doesFileExists === undefined) {
                const savedFile = await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    {
                        $type$: 'FileSystemFile',
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
                        return targetDirectory;
                    }
                } else {
                    /** update the nodes above **/
                    await this.updateFileSystemTree(
                        updatedTargetDirectoryHash,
                        FileSystem.getParentDirectoryFullPath(directoryPath),
                        FileSystem.pathJoin('/', FileSystem.getLastItem(directoryPath))
                    );
                    return await getObject(updatedTargetDirectoryHash);
                }
            }
            if (doesFileExists) {
                throw new Error('Error: a directory with the same path already exists.');
            }
            throw new Error('Error: the given directory path could not be found.');
        });
    }

    /**
     * Checks if a file exists or not
     * @param filePath
     */
    public async openFile(filePath: string): Promise<FileSystemFile | undefined> {
        const foundDir = await this.search(filePath);
        if (!foundDir) {
            return undefined;
        }
        if (!FileSystem.isFile(foundDir)) {
            return undefined;
        }

        return foundDir;
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
        FileSystem.checkIfNameIsAllowed(dirName);
        return await serializeWithType('actionLock', async () => {
            const pathExists = await this.openDir(FileSystem.pathJoin(directoryPath, dirName));
            const targetDirectory = await this.openDir(directoryPath);
            if (targetDirectory && pathExists === undefined) {
                const newDirectory = await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    {
                        $type$: 'FileSystemDirectory',
                        children: new Map()
                    }
                );
                const newDirectoryHash = await calculateHashOfObj(newDirectory.obj);
                /** Intentionally the same hash because this directory was created now **/
                await this.updateFileSystemTree(
                    newDirectoryHash,
                    directoryPath,
                    FileSystem.pathJoin('/', dirName)
                );
                return newDirectory.obj;
            }

            if (pathExists) {
                throw new Error('Error: the path already exists.');
            }
            throw new Error('Error: the given directory path could not be found.');
        });
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    public async openDir(path: string): Promise<FileSystemDirectory | undefined> {
        const foundDir = await this.search(path);
        if (!foundDir) {
            return undefined;
        }
        if (!FileSystem.isDir(foundDir)) {
            return undefined;
        }

        return foundDir;
    }

    /**
     *
     * @param rootDirectory
     */
    public set updateRoot(rootDirectory: FileSystemRoot) {
        this.rootDirectoryContent = rootDirectory.content;
    }

    // ---------------------------------------- Private ----------------------------------------

    private buildFileSystemDirectoryEntry(
        content: SHA256Hash<FileSystemDirectory | FileSystemFile>,
        mode = 0o0100777
    ): FileSystemDirectoryEntry {
        return {
            content,
            mode
        };
    }

    /**
     * This will update the directory chain recursively starting from the directory you just updated.
     * @param {SHA256Hash<FileSystemDirectory>} updatedCurrentDirectoryHash
     * @param {string} updateToPath - this gets consumed with every recursive call
     * @param {string} directorySimplePath - NOT the full path, e.g /dir1
     * @returns {Promise<void>}
     * @private
     */
    private async updateFileSystemTree(
        updatedCurrentDirectoryHash: SHA256Hash<FileSystemDirectory>,
        updateToPath: string,
        directorySimplePath: string
    ): Promise<void> {
        /** get his parent directory **/
        const currentDirectoryParent = await this.openDir(updateToPath);
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
            const parentDirectoryPath = FileSystem.getParentDirectoryFullPath(updateToPath);

            /** if its not root **/
            if (updateToPath !== '/') {
                await this.updateFileSystemTree(
                    updatedCurrentDirectoryParent,
                    parentDirectoryPath,
                    FileSystem.pathJoin('/', FileSystem.getLastItem(updateToPath))
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
     * @todo make this public
     * @param {string} givenPath - this gets consumed from the start
     * @param {SHA256Hash<FileSystemDirectory | FileSystemFile>} parentDirectoryHash
     * @returns {Promise<FileSystemDirectory | FileSystemFile | undefined>}
     * @private
     */
    private async search(
        givenPath: string,
        parentDirectoryHash: SHA256Hash<FileSystemDirectory | FileSystemFile> = this
            .rootDirectoryContent.root
    ): Promise<FileSystemDirectory | FileSystemFile | undefined> {
        /** get the top level directory **/
        const parentDirectory = await getObject(parentDirectoryHash);

        if (givenPath === '/') {
            return parentDirectory;
        }

        /** if the given path it's not the root but it's a final path, e.g '/dir1' **/
        if (givenPath !== '/' && FileSystem.hasFoldersAboveExceptRoot(givenPath)) {
            if (FileSystem.isDir(parentDirectory)) {
                const child = parentDirectory.children.get(givenPath);
                if (child) {
                    return await getObject(child.content);
                }
            }
        }

        /** if it's not a final path to search for, get the first folder in path **/
        const desiredPathInRoot = FileSystem.getFirstFolderAfterFirstSlash(givenPath);

        /** if the top level entity is a directory. Note that if it's a file and it's not the final path, it's an error **/
        if (FileSystem.isDir(parentDirectory)) {
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
     * Usually for win32 restriction e.g \\ chars
     * @param {string} value
     * @private
     */
    private static checkIfNameIsAllowed(value: string): void {
        if (!isNameAllowed.test(value)) {
            throw new Error(`Error: "${value}" as a folder or a file name is not allowed`);
        }
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
     * @param {OneObjectTypes} caughtObject
     * @returns {caughtObject is FileSystemDirectory}
     * @private
     */
    private static isDir(caughtObject: OneObjectTypes): caughtObject is FileSystemDirectory {
        return (caughtObject as FileSystemDirectory).$type$ === 'FileSystemDirectory';
    }

    /**
     *
     * @param {OneObjectTypes} caughtObject
     * @returns {caughtObject is FileSystemFile}
     * @private
     */
    private static isFile(caughtObject: OneObjectTypes): caughtObject is FileSystemFile {
        return (caughtObject as FileSystemFile).$type$ === 'FileSystemFile';
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
