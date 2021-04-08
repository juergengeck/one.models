/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {FileDescription, FileSystemDirectory, FileSystemFile, IFileSystem} from './IFileSystem';
import {BLOB, SHA256Hash} from '@OneCoreTypes';
import {createError} from 'one.core/lib/errors';
import {FS_ERRORS} from './FSErrors';
const path = require('path');
/**
 * This represents a FileSystem Structure that can create and open directories/files and persist them in one.
 * This class is using {@link PersistentFileSystemRoot}, {@link PersistentFileSystemDirectory} and {@link PersistentFileSystemFile} Recipes &
 * {@link FileSystemDirectory} and {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 */
export default class TemporaryFileSystem implements IFileSystem {
    /**
     * @global the root of the file system
     * @type string
     * @private
     */
    private rootMountDir: string;

    /**
     * @global the fstab
     * @type {Map}
     * @private
     * @todo rights???
     */
    private fstab = new Map<string, IFileSystem>();

    /**
     *
     * @param {string} rootDirectory
     */
    public constructor(rootDirectory: string) {
        // @todo remove
        this.rootMountDir = rootDirectory;
    }

    /**
     * Attaches a filesystem to a directory. It will return 0 for success or a error code
     * @param {string} storagePath
     * @param {IFileSystem} fileSystem
     * @returns {Promise<number>}
     */
    async mountFileSystem(storagePath: string, fileSystem: IFileSystem): Promise<number> {
        if (this.fstab.has(storagePath)) {
            throw createError('FSE-MOUNT1', {
                message: FS_ERRORS['FSE-MOUNT1'].message,
                path: storagePath
            });
        }

        for (const [dirPath, _] of this.fstab) {
            // @todo Cannot tree mount. Mabe change later on
            if (storagePath.includes(dirPath)) {
                throw createError('FSE-MOUNT2', {
                    message: FS_ERRORS['FSE-MOUNT2'].message,
                    path: storagePath
                });
            }
        }

        this.fstab.set(storagePath, fileSystem);

        return 0;
    }

    /**
     * Attaches a filesystem to a directory. It will return 0 for success or a error code
     * @param {string} storagePath
     * @returns {Promise<number>}
     */
    async unmountFileSystem(storagePath: string): Promise<number> {
        if (!this.fstab.has(storagePath)) {
            throw createError('FSE-MOUNT3', {
                message: FS_ERRORS['FSE-MOUNT3'].message,
                path: storagePath
            });
        }

        this.fstab.delete(storagePath);

        return 0;
    }

    /**
     * @param directoryPath
     * @param dirMode
     * @todo error handling
     */
    public async createDir(directoryPath: string, dirMode = 0o0040777): Promise<void> {
        const searchFileSystem = this.search(directoryPath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.createDir(
                searchFileSystem.relativePath,
                dirMode
            );
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'createDir()',
            path: directoryPath
        });
    }

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file.
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
        fileMode = 0o0100666
    ): Promise<void> {
        const searchFileSystem = this.search(directoryPath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.createFile(
                searchFileSystem.relativePath,
                fileHash,
                fileName,
                fileMode
            );
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'createFile()',
            path: directoryPath
        });
    }

    /**
     * Checks if a file exists or not.
     * @param filePath
     */
    public async readFile(filePath: string): Promise<FileSystemFile> {
        const searchFileSystem = this.search(filePath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.readFile(searchFileSystem.relativePath);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'readFile()',
            path: filePath
        });
    }

    /**
     * @param {string} filePath
     * @param {number} length
     * @param {number} position
     * @returns {Promise<FileSystemFile>}
     */
    public async readFileInChunks(
        filePath: string,
        length: number,
        position: number
    ): Promise<FileSystemFile> {
        if (!this.supportsChunkedReading(filePath)) {
            throw createError('FSE-CHUNK-R', {
                message: FS_ERRORS['FSE-CHUNK-R'].message,
                path: filePath
            });
        }
        const searchFileSystem = this.search(filePath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.readFileInChunks(
                searchFileSystem.relativePath,
                length,
                position
            );
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'readFileInChunks()',
            path: filePath
        });
    }

    /**
     * @param {string} filePath
     * @returns {Promise<FileSystemFile>}
     */
    public supportsChunkedReading(filePath: string): boolean {
        const searchFileSystem = this.search(filePath);
        if (searchFileSystem) {
            return searchFileSystem.fileSystem.supportsChunkedReading();
        }
        return false;
    }

    /**
     *
     * @param {string} checkPath
     * @returns {Promise<PersistentFileSystemDirectory | undefined>}
     */
    public async readDir(checkPath: string): Promise<FileSystemDirectory> {
        if (checkPath == '/') {
            return this.getRootDirContents();
        }

        const searchFileSystem = this.search(checkPath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.readDir(searchFileSystem.relativePath);
        }

        return {
            children: []
        };
    }

    /**
     *
     * @returns {Promise<FileDescription>}
     * @param checkPath
     */
    public async stat(checkPath: string): Promise<FileDescription> {
        if (checkPath === '/') {
            return {mode: 16877, size: 4096};
        }

        const searchFileSystem = this.search(checkPath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.stat(searchFileSystem.relativePath);
        }

        return {mode: 0o0120000, size: 0};
    }

    /**
     * @param pathName
     * @param mode
     */
    async chmod(pathName: string, mode: number): Promise<number> {
        const searchFileSystem = this.search(pathName);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.chmod(searchFileSystem.relativePath, mode);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'chmod()',
            path: pathName
        });
    }

    /**
     * @param src
     * @param dest
     */
    async rename(src: string, dest: string): Promise<number> {
        const searchFileSystem = this.search(src);
        const destFileSystem = this.search(dest);

        if (searchFileSystem && destFileSystem) {
            return await searchFileSystem.fileSystem.rename(
                searchFileSystem.relativePath,
                destFileSystem.relativePath
            );
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'rename()',
            destPath: dest,
            srcPath: src
        });
    }

    /**
     * @param pathName
     */
    async rmdir(pathName: string): Promise<number> {
        const searchFileSystem = this.search(pathName);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.rmdir(searchFileSystem.relativePath);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'rmdir()',
            path: pathName
        });
    }

    /**
     * @param pathName
     */
    async unlink(pathName: string): Promise<number> {
        const searchFileSystem = this.search(pathName);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.unlink(searchFileSystem.relativePath);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'unlink()',
            path: pathName
        });
    }

    /**
     *
     * @returns {Promise<void>}
     */
    public getRootDirContents(): FileSystemDirectory {
        let rootChildren = [];
        for (const [dirPath, _] of this.fstab) {
            const parentDirectoryPath = path.dirname(dirPath);
            if (parentDirectoryPath === '/') {
                rootChildren.push(path.posix.basename(dirPath));
            }
        }

        return {
            children: rootChildren
        };
    }

    /**
     *
     * @param {string} checkPath
     * @returns {Promise<void>}
     */
    public search(checkPath: string): {fileSystem: IFileSystem; relativePath: string} | null {
        if (this.fstab.has(checkPath)) {
            const mountedFileSystem = this.fstab.get(checkPath);
            if (mountedFileSystem) {
                return {fileSystem: mountedFileSystem, relativePath: '/'};
            }
        }

        const parentCheckPath = path.dirname(checkPath);
        for (const [dirPath, mountedFileSystem] of this.fstab) {
            if (parentCheckPath.includes(dirPath)) {
                return {
                    fileSystem: mountedFileSystem,
                    relativePath: checkPath.substring(
                        checkPath.indexOf(dirPath) + dirPath.length,
                        checkPath.length
                    )
                };
            }
        }

        return null;
    }

    /**
     * Creates a symlink. Return 0 for success or an error code
     *
     * @param {string} src
     * @param {string} dest
     * @returns {Promise<number>}
     */
    async symlink(src: string, dest: string): Promise<number> {
        const searchFileSystem = this.search(dest);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.symlink(src, searchFileSystem.relativePath);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'symlink()',
            src: src,
            dest: dest
        });
    }

    /**
     * Reads a symlink. Return 0 for success or an error code and the pointed path
     *
     * @param {string} src
     * @param {string} dest
     * @returns {Promise<number>}
     */
    async readLink(filePath: string): Promise<FileSystemFile> {
        const searchFileSystem = this.search(filePath);
        if (searchFileSystem) {
            return await searchFileSystem.fileSystem.readLink(searchFileSystem.relativePath);
        }

        throw createError('FSE-FSMAP', {
            message: FS_ERRORS['FSE-FSMAP'].message,
            op: 'readLink()',
            path: filePath
        });
    }
}
