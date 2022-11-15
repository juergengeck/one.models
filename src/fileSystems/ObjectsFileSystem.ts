import type {
    FileDescription,
    FileSystemDirectory,
    FileSystemFile,
    IFileSystem
} from './IFileSystem';
import FileSystemHelpers from './FileSystemHelpers';
import {
    getFileType,
    getObject,
    getTextFile,
    listAllObjectHashes
} from '@refinio/one.core/lib/storage';
import {createError} from '@refinio/one.core/lib/errors';
import {FS_ERRORS} from './FileSystemErrors';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {BLOB, HashTypes} from '@refinio/one.core/lib/recipes';
import type {OneObjectTypes} from '@refinio/one.core/lib/recipes';
import {getIdObject} from '@refinio/one.core/lib/storage-versioned-objects';

/**
 * Json format for the objects parsed path
 */
type ParsedObjectsPath = {
    isRoot: boolean;
    hash: SHA256Hash<HashTypes> | null;
    suffix: string | null;
};

/**
 * This represents a FileSystem Structure for one objects that can open directories or files on the fly.
 * This class is using {@link FileSystemDirectory} & {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 */
export default class ObjectsFileSystem implements IFileSystem {
    /**
     * @global the root of the file system
     * @type {FileSystemDirectory}
     * @private
     */
    //@ts-ignore
    private readonly rootDirectory: FileSystemDirectory;

    private readonly rootMode: number = 0o0040555;

    constructor(rootDirectory: FileSystemDirectory = {children: []}) {
        this.rootDirectory = rootDirectory;
    }

    /**
     * The current Object File System is not supporting the creation of directories.
     * @param {string} directoryPath
     * @param {number} dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(directoryPath: string, dirMode: number): Promise<void> {
        const rootMode = FileSystemHelpers.retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw createError('FSE-EACCES-W', {
                message: FS_ERRORS['FSE-EACCES-W'].message,
                path: directoryPath
            });
        } else {
            throw createError('FSE-ENOSYS', {
                message: FS_ERRORS['FSE-ENOSYS'].message,
                functionName: 'createDir()',
                path: directoryPath
            });
        }
    }

    /**
     *
     * @param {string} filePath
     * @param {number} length
     * @param {number} position
     * @returns {Promise<FileSystemFile>}
     */
    async readFileInChunks(
        filePath: string,
        length: number,
        position: number
    ): Promise<FileSystemFile> {
        if (!this.supportsChunkedReading()) {
            throw createError('FSE-CHUNK-R', {
                message: FS_ERRORS['FSE-CHUNK-R'].message,
                path: filePath
            });
        }

        const content = await this.retrieveContentAboutHash(filePath);
        if (!content) {
            throw createError('FSE-ENOENT', {
                message: FS_ERRORS['FSE-ENOENT'].message,
                path: filePath
            });
        }
        return {
            content: ObjectsFileSystem.stringToArrayBuffer(content).slice(
                position,
                position + length
            )
        };
    }

    /**
     *
     * @param {string} path
     * @returns {boolean}
     */
    supportsChunkedReading(path?: string): boolean {
        return typeof global !== 'undefined' && {}.toString.call(global) === '[object global]';
    }

    /**
     * The current Object File System is not supporting the creation of files.
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} fileHash
     * @param {string} fileName
     * @param {number} fileMode
     * @returns {Promise<FileSystemFile>}
     */
    async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<void> {
        const rootMode = FileSystemHelpers.retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw createError('FSE-EACCES-W', {
                message: FS_ERRORS['FSE-EACCES-W'].message,
                path: directoryPath
            });
        } else {
            throw createError('FSE-ENOSYS', {
                message: FS_ERRORS['FSE-ENOSYS'].message,
                functionName: 'createFile()',
                path: directoryPath
            });
        }
    }

    /**
     * Open directory. Paths are checked since it is a FS built on-the-fly.
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    async readDir(dirPath: string): Promise<FileSystemDirectory> {
        const parsedPath = this.parsePath(dirPath);
        const hashMap = await this.retrieveHashesWithType();

        /** if it is the root path **/
        if (parsedPath.isRoot) {
            return {children: Array.from(hashMap.keys())};
        }

        /** Handle malformed path / not a valid one hash **/
        if (!parsedPath.hash) {
            throw createError('FSE-ENOENT', {
                message: FS_ERRORS['FSE-ENOENT'].message,
                path: dirPath
            });
        }

        if (parsedPath.suffix === '/' || parsedPath.suffix === '') {
            /** different behaviour for BLOB and CBLOB **/
            if (
                hashMap.get(parsedPath.hash) === 'BLOB' ||
                hashMap.get(parsedPath.hash) === 'CBLOB'
            ) {
                return await ObjectsFileSystem.returnDirectoryContentForBLOBS();
            } else if (hashMap.get(parsedPath.hash) === 'Plan') {
                return await ObjectsFileSystem.returnDirectoryContentForPlans();
            } else {
                return await ObjectsFileSystem.returnDirectoryContentForRegularObject();
            }
        }
        throw createError('FSE-ENOENT', {message: FS_ERRORS['FSE-ENOENT'].message, path: dirPath});
    }

    /**
     * Opens the file on-the-fly.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    async readFile(filePath: string): Promise<FileSystemFile> {
        const content = await this.retrieveContentAboutHash(filePath);
        if (!content) {
            throw createError('FSE-ENOENT', {
                message: FS_ERRORS['FSE-ENOENT'].message,
                path: filePath
            });
        }
        return {
            content: ObjectsFileSystem.stringToArrayBuffer(content)
        };
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<void>}
     */
    public async exists(path: string): Promise<boolean> {
        const parsedPath = this.parsePath(path);
        if (parsedPath.hash) {
            /** check if the hash exists **/
            await getObject(parsedPath.hash as SHA256Hash).catch(ignored => {
                return false;
            });
            return true;
        }
        /** check if its one of those hardcoded file's name **/
        return !(
            parsedPath.suffix &&
            !['raw.txt', 'type.txt', 'pretty.txt', 'json.txt', 'moduleHash.txt'].includes(
                parsedPath.suffix
            )
        );
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FileDescription>}
     */
    async stat(path: string): Promise<FileDescription> {
        const parsedPath = this.parsePath(path);
        if (parsedPath.isRoot || parsedPath.suffix === '/' || parsedPath.suffix === '') {
            return {mode: this.rootMode, size: 0};
        }
        if (
            parsedPath.suffix === '/raw.txt' ||
            parsedPath.suffix === '/pretty.txt' ||
            parsedPath.suffix === '/json.txt' ||
            parsedPath.suffix === '/type.txt'
        ) {
            const file = await this.readFile(path);
            if (file) {
                return {mode: 0o0100444, size: file.content.byteLength};
            }
        }
        if (parsedPath.suffix === '/moduleHash.txt') {
            return {mode: 0o0120000, size: 0};
        }
        throw createError('FSE-ENOENT', {message: FS_ERRORS['FSE-ENOENT'].message, path: path});
    }

    /**
     * Parses the given path.
     * @param {string} path
     * @returns {ParsedObjectsPath}
     * @private
     */
    public parsePath(path: string): ParsedObjectsPath {
        if (path === '/') {
            return {
                isRoot: true,
                hash: null,
                suffix: ''
            };
        }

        const isHash = /^\/([0-9A-Fa-f]{64})(.*)$/;
        const containsValidHash = path.match(isHash);

        /** if it does not contains a valid hash or no hash at all **/
        if (!containsValidHash || containsValidHash.length != 3) {
            return {
                isRoot: false,
                hash: null,
                suffix: null
            };
        } else {
            return {
                isRoot: false,
                hash: containsValidHash[1] as SHA256Hash<HashTypes>,
                suffix: containsValidHash[2]
            };
        }
    }

    /**
     * Not implemented because of Read Only FS
     * @param pathName
     * @param mode
     */
    chmod(pathName: string, mode: number): Promise<number> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'chmod()',
            path: pathName
        });
    }

    /**
     * Not implemented because of Read Only FS
     * @param src
     * @param dest
     */
    rename(src: string, dest: string): Promise<number> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'rename()',
            path: src
        });
    }

    /**
     * Not implemented because of Read Only FS
     * @param pathName
     */
    rmdir(pathName: string): Promise<number> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'rmdir()',
            path: pathName
        });
    }

    /**
     * Not implemented because of Read Only FS
     * @param pathName
     */
    unlink(pathName: string): Promise<number> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'unlink()',
            path: pathName
        });
    }

    // ---------------------------------------- Private ----------------------------------------

    /**
     * Retrieves directory content for blob hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForBLOBS(): Promise<FileSystemDirectory> {
        return {
            children: ['raw', 'type']
        };
    }

    /**
     * Retrieves directory content for Plan hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForPlans(): Promise<FileSystemDirectory> {
        return {
            children: ['raw.txt', 'pretty.txt', 'json.txt', 'type.txt', 'moduleHash.txt']
        };
    }

    /**
     * Retrieves directory content for regular hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForRegularObject(): Promise<FileSystemDirectory> {
        return {
            children: ['raw.txt', 'pretty.txt', 'json.txt', 'type.txt']
        };
    }

    /**
     * Converts string to an Array Buffer.
     * @param {string} str
     * @returns {ArrayBuffer}
     * @private
     */
    private static stringToArrayBuffer(str: string): ArrayBuffer {
        const buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
        const bufView = new Uint16Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }
    /**
     * Maps hash on the specific file type.
     * @returns {Promise<Map<SHA256Hash<HashTypes>, string>>}
     * @private
     */
    private async retrieveHashesWithType(): Promise<Map<SHA256Hash<HashTypes>, string>> {
        const hashes = await listAllObjectHashes();
        const hashesMap = new Map<SHA256Hash<HashTypes>, string>();
        await Promise.all(
            hashes.map(async (hash: SHA256Hash<HashTypes>) => {
                const hashType = await getFileType(hash);
                hashesMap.set(hash, hashType);
            })
        );
        return hashesMap;
    }

    /**
     * Utility function to return the right data format for different paths.
     * @param path
     */
    private async retrieveContentAboutHash(path: string): Promise<string | undefined> {
        const parsedPath = this.parsePath(path);

        function promiseHandler<T extends OneObjectTypes>(promise: Promise<T>) {
            return promise.then(data => [null, data]).catch(err => [err]);
        }

        if (parsedPath.suffix === '/raw.txt') {
            return await getTextFile(parsedPath.hash as SHA256Hash);
        }

        if (parsedPath.suffix === '/pretty.txt') {
            return ObjectsFileSystem.stringifyXML(await getTextFile(parsedPath.hash as SHA256Hash));
        }

        if (parsedPath.suffix === '/json.txt') {
            let err, obj;
            [err, obj] = await promiseHandler(getObject(parsedPath.hash as SHA256Hash));
            // getObjects can't handle idObjects, so we must use getIdObjectByIdHash
            if (err) {
                // allowed cast since it's the hash of an idObject
                obj = await getIdObject(parsedPath.hash as unknown as SHA256IdHash);
            }

            return JSON.stringify(obj, null, '  ');
        }

        if (parsedPath.suffix === '/type.txt') {
            const fileType = await getFileType(parsedPath.hash as SHA256Hash);
            if (fileType === 'BLOB' || fileType === 'CBLOB') {
                return fileType;
            } else {
                let err, obj;
                [err, obj] = await promiseHandler(getObject(parsedPath.hash as SHA256Hash));
                // getObjects can't handle idObjects, so we must use getIdObjectByIdHash
                if (err) {
                    // allowed cast since it's the hash of an idObject
                    obj = await getIdObject(parsedPath.hash as unknown as SHA256IdHash);
                }

                return obj.$type$;
            }
        }

        return undefined;
    }

    /**
     * Prettify a given xml format as string
     * @static
     * @param {string} xmlFormat
     * @returns {string}
     * @private
     */
    private static stringifyXML(xmlFormat: string): string {
        /** variables **/
        let deepLevel = 0;
        let accumulator = '';
        let index = 0;

        const xmlAsArray = xmlFormat.split(RegExp('(<.*?>)|(.+?(?=<|$))')).filter(value => value);

        for (const value of xmlAsArray) {
            /** if it reached the end **/
            if (index === xmlAsArray.length - 1) {
                accumulator += value + '\n';
            } else if (value.includes('<') && !value.includes('</')) {
                /** if it reached the start of a statement. see '<' **/
                let ident = '';

                for (let i = 0; i < deepLevel; i++) {
                    ident += '   ';
                }
                deepLevel++;

                accumulator += ident + value + '\n';
            } else if (value.includes('</')) {
                /** if it reached the end of a statement **/
                let ident = '';

                for (let i = 0; i < deepLevel; i++) {
                    ident += '   ';
                }

                accumulator += ident + value + '\n';
            } else {
                /** in between **/
                let ident = '';

                for (let i = 0; i < deepLevel; i++) {
                    ident += '   ';
                }
                deepLevel--;

                accumulator += ident + value + '\n';
            }
            index++;
        }
        /** return the prettified xml **/
        return accumulator;
    }

    /**
     * Not implemented
     * @param {string} src
     * @param {string} dest
     * @returns {Promise<void>}
     */
    symlink(src: string, dest: string): Promise<void> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'symlink()',
            path: src
        });
    }

    /**
     * Not implemented
     * @param {string} filePath
     * @returns {Promise<number>}
     */
    readlink(filePath: string): Promise<FileSystemFile> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'readLink()',
            path: filePath
        });
    }
}
