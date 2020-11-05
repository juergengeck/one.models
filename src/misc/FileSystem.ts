/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {BLOB, FilerDirectory, FileRule, SHA256Hash} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {serializeWithType} from 'one.core/lib/util/promise';

export default class FileSystem {
    private rootDirectory: SHA256Hash<FilerDirectory>;
    public constructor(rootDirectory: SHA256Hash<FilerDirectory>) {
        this.rootDirectory = rootDirectory;
    }
    public onRootUpdate: ((rootHash: SHA256Hash<FilerDirectory>) => void) | null = null;

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param directoryPath
     * @param fileHash
     * @param fileName
     * @param fileMode
     */
    public async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FilerDirectory> {
        return await serializeWithType('actionLock', async () => {
            const targetDirectory = await this.openDir(directoryPath);
            if (targetDirectory) {
                /** calculate the hash of the outdated directory **/
                const oldTargetDirectoryHash = await calculateHashOfObj(targetDirectory);

                const fileIndex = targetDirectory.files.findIndex(
                    (file: FileRule) => file.name === fileName
                );
                /** if the file exists **/
                if (fileIndex !== -1) {
                    /** replace it **/
                    targetDirectory.files[fileIndex] = {
                        BLOB: fileHash,
                        mode: fileMode,
                        name: fileName
                    };
                } else {
                    /** otherwise add the file **/
                    targetDirectory.files.push({
                        BLOB: fileHash,
                        mode: fileMode,
                        name: fileName
                    });
                }

                /** update the directory **/
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    targetDirectory
                );
                /** get the updated directory hash **/
                const updatedTargetDirectoryHash = await calculateHashOfObj(targetDirectory);
                /** update the nodes above **/
                await this.updateParentDirectoryRecursive(
                    oldTargetDirectoryHash,
                    updatedTargetDirectoryHash
                );
                return await getObject(updatedTargetDirectoryHash);
            }

            throw new Error('Directory could not be found');
        });
    }

    /**
     * Checks if a file exists or not
     * @param directoryPath
     * @param fileName
     */
    public async openFile(directoryPath: string, fileName: string): Promise<FileRule | undefined> {
        const directory = await this.openDir(directoryPath);
        if (directory) {
            const foundFile = directory.files.find((file: FileRule) => file.name === fileName);
            if (foundFile) {
                return foundFile;
            }
            return undefined;
        }
        return undefined;
    }

    /**
     * @param directoryPath
     * @param newDirectoryObj
     */
    public async createDir(
        directoryPath: string,
        newDirectoryObj: FilerDirectory
    ): Promise<FilerDirectory> {
        return await serializeWithType('actionLock', async () => {
            const targetDirectory = await this.openDir(directoryPath);

            const pathExists = await this.openDir(newDirectoryObj.path);

            if (targetDirectory && pathExists === undefined) {
                /** calculate the hash of the outdated directory **/
                const newDirectory = await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    newDirectoryObj
                );
                const newDirectoryHash = await calculateHashOfObj(newDirectory.obj);

                /** Intentionally the same hash because this directory was created now **/
                await this.updateParentDirectoryRecursive(newDirectoryHash, newDirectoryHash);
                return newDirectory.obj;
            }

            throw new Error('Directory could not be found');
        });
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FilerDirectory | undefined>}
     */
    public async openDir(path: string): Promise<FilerDirectory | undefined> {
        /** check if it is the root directory **/
        for await (const dir of this.iterateDirectories(this.rootDirectory)) {
            if (dir.path === path) {
                return dir;
            }
        }
        return undefined;
    }

    public set updateRoot(rootHash: SHA256Hash<FilerDirectory>) {
        this.rootDirectory = rootHash;
    }

    // ---------------------------------------- Private ----------------------------------------

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
        const parentPath = this.getParentDirectoryFullPath(currentDirectory.path);
        /** get his parent directory **/
        const currentDirectoryParent = await this.openDir(parentPath);

        /** check if the parent directory exists**/
        if (currentDirectoryParent) {
            /** first, calculate the outdated parent hash **/
            const oldParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
            /** locate the outdated current directory hash in the parent's children **/
            const indexOfOutdatedParentDirectory = currentDirectoryParent.children.findIndex(
                (childDirectoryHash: SHA256Hash<FilerDirectory>) =>
                    childDirectoryHash === outdatedCurrentDirectoryHash
            );
            if (indexOfOutdatedParentDirectory !== -1) {
                /** replace it with the updated current directory **/
                currentDirectoryParent.children[
                    indexOfOutdatedParentDirectory
                ] = updatedCurrentDirectoryHash;
            } else {
                /** otherwise just push it **/
                currentDirectoryParent.children.push(updatedCurrentDirectoryHash);
            }
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

            if (currentDirectoryParent.path !== '/') {
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
     * Consume files one-at-a-time
     * @param {SHA256Hash<FilerDirectory>} directoryHash
     */
    private async *iterateDirectories(
        directoryHash: SHA256Hash<FilerDirectory>
    ): AsyncGenerator<FilerDirectory> {
        const currentDirectory = await getObject(directoryHash);
        const childDirectories = currentDirectory.children;
        if (childDirectories.length > 0) {
            for (const dir of childDirectories) {
                yield currentDirectory;
                yield* this.iterateDirectories(dir);
            }
        } else {
            yield currentDirectory;
        }
    }
}
