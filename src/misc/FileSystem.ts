/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {BLOB, FilerDirectory, FilerFile, OneObjectTypes, SHA256Hash} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {serializeWithType} from 'one.core/lib/util/promise';

/**
 * @type {RegExp}
 */
const isNameAllowed = new RegExp('^[^\\\\/?%*:|"<>]+$');

// @todo nice interface for file modes

export default class FileSystem {
    private rootDirectory: SHA256Hash<FilerDirectory>;

    /**
     *
     * @param {SHA256Hash<FilerDirectory>} rootDirectory
     */
    public constructor(rootDirectory: SHA256Hash<FilerDirectory>) {
        this.rootDirectory = rootDirectory;
    }

    /**
     *
     * @type {((rootHash: SHA256Hash<FilerDirectory>) => void) | null}
     */
    public onRootUpdate: ((rootHash: SHA256Hash<FilerDirectory>) => void) | null = null;

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} fileHash
     * @param {string} fileName
     * @param {number} fileMode
     * @returns {Promise<FilerDirectory>}
     */
    public async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FilerDirectory> {
        FileSystem.checkIfNameIsAllowed(fileName);

        return await serializeWithType('actionLock', async () => {
            const targetDirectory = await this.openDir(directoryPath);
            const doesDirectoryExist = await this.openDir(
                FileSystem.pathJoin(directoryPath, fileName)
            );
            if (targetDirectory && doesDirectoryExist === undefined) {
                /** calculate the hash of the outdated directory **/
                const oldTargetDirectoryHash = await calculateHashOfObj(targetDirectory);

                const savedFile = await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    {
                        $type$: 'FilerFile',
                        meta: {
                            name: fileName,
                            mode: fileMode,
                            path: FileSystem.pathJoin(directoryPath, fileName)
                        },
                        content: fileHash
                    }
                );

                targetDirectory.children.set(`/${fileName}`, savedFile.hash);

                /** update the directory **/
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    targetDirectory
                );
                /** if the file is added on root, don't go recursive on the tree **/
                const updatedTargetDirectoryHash = await calculateHashOfObj(targetDirectory);
                if (targetDirectory.meta.path === '/') {
                    /** update the channel with the updated root directory **/
                    if (this.onRootUpdate) {
                        await this.onRootUpdate(updatedTargetDirectoryHash);
                        return targetDirectory;
                    }
                } else {
                    /** update the nodes above **/
                    await this.updateParentDirectoryRecursive(
                        oldTargetDirectoryHash,
                        updatedTargetDirectoryHash
                    );
                    return await getObject(updatedTargetDirectoryHash);
                }
            }
            if (doesDirectoryExist) {
                throw new Error('Error: a directory with the same path already exists.');
            }
            throw new Error('Error: the given directory path could not be found.');
        });
    }

    /**
     * Checks if a file exists or not
     * @param filePath
     */
    public async openFile(filePath: string): Promise<FilerFile | undefined> {
        const foundDir = await this.search(filePath, this.rootDirectory);
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
    ): Promise<FilerDirectory> {
        FileSystem.checkIfNameIsAllowed(dirName);
        return await serializeWithType('actionLock', async () => {
            const pathExists = await this.openDir(FileSystem.pathJoin(directoryPath, dirName));
            const targetDirectory = await this.openDir(directoryPath);

            if (targetDirectory && pathExists === undefined) {
                /** calculate the hash of the outdated directory **/
                const newDirectory = await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    {
                        $type$: 'FilerDirectory',
                        children: new Map(),
                        meta: {
                            name: dirName,
                            mode: dirMode,
                            path: FileSystem.pathJoin(directoryPath, dirName)
                        }
                    }
                );
                const newDirectoryHash = await calculateHashOfObj(newDirectory.obj);

                /** Intentionally the same hash because this directory was created now **/
                await this.updateParentDirectoryRecursive(newDirectoryHash, newDirectoryHash);
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
     * @returns {Promise<FilerDirectory | undefined>}
     */
    public async openDir(path: string): Promise<FilerDirectory | undefined> {
        const foundDir = await this.search(path, this.rootDirectory);
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
     * @param {SHA256Hash<FilerDirectory>} rootHash
     */
    public set updateRoot(rootHash: SHA256Hash<FilerDirectory>) {
        this.rootDirectory = rootHash;
    }

    // ---------------------------------------- Private ----------------------------------------

    /**
     * Updates the nodes above
     * @param {SHA256Hash<FilerDirectory>} outdatedCurrentDirectoryHash
     * @param {SHA256Hash<FilerDirectory>} updatedCurrentDirectoryHash
     * @returns {Promise<void>}
     * @private
     */
    private async updateParentDirectoryRecursive(
        outdatedCurrentDirectoryHash: SHA256Hash<FilerDirectory>,
        updatedCurrentDirectoryHash: SHA256Hash<FilerDirectory>
    ): Promise<void> {
        /** get the current directory **/
        const currentDirectory = await getObject(updatedCurrentDirectoryHash);

        /** get his parent path **/
        const parentPath = this.getParentDirectoryFullPath(currentDirectory.meta.path);
        /** get his parent directory **/
        const currentDirectoryParent = await this.openDir(parentPath);
        /** check if the parent directory exists**/
        if (currentDirectoryParent) {
            const updatedCurrentDirectoryName = (await getObject(updatedCurrentDirectoryHash)).meta
                .name;
            const updatedCurrentDirectoryPath = `/${updatedCurrentDirectoryName}`;
            /** first, calculate the outdated parent hash **/
            const oldParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
            /** locate the outdated current directory hash in the parent's children **/
            currentDirectoryParent.children.set(
                updatedCurrentDirectoryPath,
                updatedCurrentDirectoryHash
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
            const updatedParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
            /** update the nodes above **/

            if (currentDirectoryParent.meta.path !== '/') {
                await this.updateParentDirectoryRecursive(
                    oldParentDirectoryHash,
                    updatedParentDirectoryHash
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
     *
     * @param {string} givenPath
     * @param {SHA256Hash<FilerDirectory | FilerFile>} directoryHash
     * @returns {Promise<FilerDirectory | FilerFile | undefined>}
     * @private
     */
    private async search(
        givenPath: string,
        directoryHash: SHA256Hash<FilerDirectory | FilerFile>
    ): Promise<FilerDirectory | FilerFile | undefined> {
        /** get the top level directory **/
        const root = await getObject(directoryHash);

        if (givenPath === '/') {
            return root;
        }

        /** if the given path it's not the root but it's a final path, e.g '/dir1' **/
        if (givenPath !== '/' && FileSystem.hasFoldersAboveExceptRoot(givenPath)) {
            if (FileSystem.isDir(root)) {
                const childHash = root.children.get(givenPath);
                if (childHash) {
                    return await getObject(childHash);
                }
            }
        }

        /** if it's not a final path to search for, get the first folder in path **/
        const desiredPathInRoot = FileSystem.getRootFolderInPath(givenPath);

        /** if the top level entity is a directory. Note that if it's a file and it's not the final path, it's an error **/
        if (FileSystem.isDir(root)) {
            /** get his child **/
            const foundDirectoryHash = root.children.get(`/${desiredPathInRoot}`);
            if (foundDirectoryHash) {
                /** consume the path from the start **/
                const nextPath = givenPath.replace(`/${desiredPathInRoot}`, '');
                return await this.search(nextPath, foundDirectoryHash);
            } else {
                return undefined;
            }
        }
        return undefined;
    }

    /**
     *
     * @param {string} givenPath
     * @returns {string}
     * @private
     */
    private getParentDirectoryFullPath(givenPath: string): string {
        const regex = new RegExp('/[^/]*$');
        let res = givenPath.replace(regex, '/');
        if (res !== '/') {
            return res.substring(0, res.length - 1);
        }
        return res;
    }

    /**
     *
     * @param {string} pathToJoin
     * @param {string} path
     * @returns {string}
     * @private
     */
    private static pathJoin(pathToJoin: string, path: string): string {
        return pathToJoin === '/' ? `${pathToJoin}${path}` : `${pathToJoin}/${path}`;
    }

    /**
     *
     * @param {string} value
     * @private
     */
    private static checkIfNameIsAllowed(value: string): void {
        if (!isNameAllowed.test(value)) {
            throw new Error(`Error: "${value}" as a folder or a file name is not allowed`);
        }
    }

    /**
     *
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
     * @returns {caughtObject is FilerDirectory}
     * @private
     */
    private static isDir(caughtObject: OneObjectTypes): caughtObject is FilerDirectory {
        return (caughtObject as FilerDirectory).$type$ === 'FilerDirectory';
    }

    /**
     *
     * @param {OneObjectTypes} caughtObject
     * @returns {caughtObject is FilerFile}
     * @private
     */
    private static isFile(caughtObject: OneObjectTypes): caughtObject is FilerFile {
        return (caughtObject as FilerFile).$type$ === 'FilerFile';
    }

    /**
     *
     * @param {string} path
     * @returns {string}
     * @private
     */
    private static getRootFolderInPath(path: string): string {
        const splitedPath: string[] = path.split('/');
        if (splitedPath[0] === '') {
            return splitedPath.splice(1, splitedPath.length)[0];
        } else {
            return splitedPath[0];
        }
    }
}
