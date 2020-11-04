/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {BLOB, FilerDirectory, FileRule, SHA256Hash} from '@OneCoreTypes';
import {EventEmitter} from 'events';
import {createSingleObjectThroughPurePlan, getObject} from 'one.core/lib/storage';
import {ChannelManager} from './index';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';

export class FilerModel extends EventEmitter {
    private channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    public constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.channelId = 'rootDirectories';
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * create the channel & the root directory if it does not exists
     * @returns {Promise<void>}
     */
    public async init() {
        await this.channelManager.createChannel(this.channelId);
        await this.createRootDirectoryIfNotExists();
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param directoryPath
     * @param fileHash
     * @param fileName
     * @param fileMode
     */
    public async addFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FilerDirectory> {
        const targetDirectory = await this.retrieveDirectory(directoryPath);
        if (targetDirectory) {
            /** calculate the hash of the outdated directory **/
            const oldTargetDirectoryHash = await calculateHashOfObj(targetDirectory);

            const fileIndex = targetDirectory.files.findIndex(
                (file: FileRule) => file.name === fileName
            );
            /** if the file exists **/
            if (fileIndex) {
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
    }

    /**
     * @param directoryPath
     * @param newDirectoryObj
     */
    public async addDirectoryToDirectory(
        directoryPath: string,
        newDirectoryObj: FilerDirectory
    ): Promise<FilerDirectory> {
        const targetDirectory = await this.retrieveDirectory(directoryPath);

        const pathExists = await this.retrieveDirectory(newDirectoryObj.path);

        if (targetDirectory && pathExists === undefined) {
            /** calculate the hash of the outdated directory **/
            const oldTargetDirectoryHash = await calculateHashOfObj(targetDirectory);
            const newDirectory = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                newDirectoryObj
            );
            targetDirectory.children.push(await calculateHashOfObj(newDirectory));
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
    }

    /**
     * Checks if a file exists or not
     * @param directoryPath
     * @param fileName
     */
    public async retrieveFile(
        directoryPath: string,
        fileName: string
    ): Promise<FileRule | undefined> {
        const directory = await this.retrieveDirectory(directoryPath);
        if (directory) {
            const exists = directory.files.find((file: FileRule) => file.name === fileName);
            if (exists) {
                return exists;
            }
            return undefined;
        }
        return undefined;
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FilerDirectory | undefined>}
     */
    public async retrieveDirectory(path: string): Promise<FilerDirectory | undefined> {
        /** get the latest root directory in the channel **/
        const directoriesResults = await this.channelManager.getObjectsWithType('FilerDirectory', {
            channelId: this.channelId,
            count: 1
        });
        const rootDirectory = directoriesResults[0];
        /** check if it is the root directory **/
        if (rootDirectory && rootDirectory.data.path === '/') {
            for await (const dir of this.iterateDirectories(rootDirectory.dataHash)) {
                if (dir.path === path) {
                    return dir;
                }
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
        const currentDirectoryParent = await this.retrieveDirectory(parentPath);

        /** check if the parent directory exists**/
        if (currentDirectoryParent) {
            /** check if it is the root or not **/
            if (currentDirectoryParent.path !== '/') {
                /** first, calculate the outdated parent hash **/
                const oldParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
                /** locate the outdated current directory hash in the parent's children **/
                const indexOfOutdatedParentDirectory = currentDirectoryParent.children.findIndex(
                    (childDirectoryHash: SHA256Hash<FilerDirectory>) =>
                        childDirectoryHash === outdatedCurrentDirectoryHash
                );
                /** replace it with the updated current directory **/
                currentDirectoryParent.children[
                    indexOfOutdatedParentDirectory
                ] = updatedCurrentDirectoryHash;
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
                await this.updateParentDirectoryRecursive(
                    oldParentDirectoryHash,
                    updatedParentDirectoryHash
                );
            } else {
                /** update the channel with the updated root directory **/
                await this.channelManager.postToChannel(this.channelId, currentDirectoryParent);
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

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    private async createRootDirectoryIfNotExists(): Promise<void> {
        const rootDirectory = await this.channelManager.getObjectsWithType('FilerDirectory', {
            channelId: this.channelId
        });
        if (rootDirectory.length === 0) {
            const root = await createSingleObjectThroughPurePlan({
                module: '@module/createRootFilerDirectory',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            });
            await this.channelManager.postToChannel(this.channelId, root.obj);
        }
    }

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
