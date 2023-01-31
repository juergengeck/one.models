import type {
    FileDescription,
    FileSystemDirectory,
    FileSystemFile,
    IFileSystem
} from './IFileSystem';
import FileSystemHelpers from './FileSystemHelpers';
import {createError} from '@refinio/one.core/lib/errors';
import {FS_ERRORS} from './FileSystemErrors';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {BLOB, HashTypes, OneObjectTypes} from '@refinio/one.core/lib/recipes';
import {getIdObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    getFileType,
    listAllObjectHashes,
    readUTF8TextFile
} from '@refinio/one.core/lib/system/storage-base';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';

/**
 * Json format for the objects parsed path
 */
type ParsedObjectsPath = {
    isRoot: boolean;
    type: string | null;
    hash: SHA256Hash<HashTypes> | null;
    suffix: string | null;
};

/**
 * This represents a FileSystem Structure for one objects that can open directories or files on the fly.
 * This class is using {@link FileSystemDirectory} & {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 */
export default class TypesFileSystem implements IFileSystem {
    /**
     * @global the root of the file system
     * @type {FileSystemDirectory}
     * @private
     */
    private readonly rootDirectory: FileSystemDirectory;

    private readonly rootMode: number = 0o0040555;

    constructor(rootDirectory: FileSystemDirectory = {children: []}) {
        this.rootDirectory = rootDirectory;
    }

    /**
     * The current Object File System is not supporting the creation of directories.
     * @param {string} directoryPath
     * @param {number} _dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(directoryPath: string, _dirMode: number): Promise<void> {
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
            content: TypesFileSystem.stringToArrayBuffer(content).slice(position, position + length)
        };
    }

    /**
     *
     * @param {string} _path
     * @returns {boolean}
     */
    supportsChunkedReading(_path?: string): boolean {
        return typeof global !== 'undefined' && {}.toString.call(global) === '[object global]';
    }

    /**
     * The current Object File System is not supporting the creation of files.
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} _fileHash
     * @param {string} _fileName
     * @param {number} _fileMode
     * @returns {Promise<FileSystemFile>}
     */
    async createFile(
        directoryPath: string,
        _fileHash: SHA256Hash<BLOB>,
        _fileName: string,
        _fileMode: number
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

        /** if it is the root path **/
        if (!parsedPath.type) {
            const allHashes = await listAllObjectHashes();
            const types: string[] = [];
            for (const hash of allHashes) {
                const type = await getFileType(hash);
                if (!types.includes(type)) {
                    types.push(type);
                }
            }
            return {children: types};
        }

        /** in type folder **/
        if (!parsedPath.hash) {
            const hashes = await this.retrieveHashesForType(parsedPath.type);
            return {children: hashes};
        }

        if (parsedPath.suffix === '/' || parsedPath.suffix === '') {
            /** different behaviour for BLOB and CBLOB **/
            if (parsedPath.type === 'BLOB' || parsedPath.type === 'CBLOB') {
                return await TypesFileSystem.returnDirectoryContentForBLOBS();
            } else if (parsedPath.type === 'Plan') {
                return await TypesFileSystem.returnDirectoryContentForPlans();
            } else {
                return await TypesFileSystem.returnDirectoryContentForRegularObject();
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
            content: TypesFileSystem.stringToArrayBuffer(content)
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
            !['raw.txt', 'type.txt', 'pretty.html', 'json.txt', 'moduleHash.txt'].includes(
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
            parsedPath.suffix === '/pretty.html' ||
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
                type: null,
                suffix: null
            };
        }

        const [_empty, type, hash, ...rest] = path.split('/');

        if (!type) {
            return {
                isRoot: true,
                hash: null,
                type: null,
                suffix: ''
            };
        }

        if (!hash) {
            return {
                isRoot: false,
                hash: null,
                type: type,
                suffix: '/'
            };
        }

        const hashRegex = /^([0-9A-Fa-f]{64})$/;
        const isHash = hash.match(hashRegex);

        if (!isHash) {
            return {
                isRoot: false,
                hash: null,
                type: type,
                suffix: '/'
            };
        }

        return {
            isRoot: false,
            hash: hash as SHA256Hash<HashTypes>,
            type: type,
            suffix: rest && rest.length > 0 ? `/${rest.join('/')}` : null
        };
    }

    /**
     * Not implemented because of Read Only FS
     * @param pathName
     * @param _mode
     */
    chmod(pathName: string, _mode: number): Promise<number> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'chmod()',
            path: pathName
        });
    }

    /**
     * Not implemented because of Read Only FS
     * @param src
     * @param _dest
     */
    rename(src: string, _dest: string): Promise<number> {
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
            children: ['raw.txt', 'pretty.html', 'json.txt', 'type.txt', 'moduleHash.txt']
        };
    }

    /**
     * Retrieves directory content for regular hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForRegularObject(): Promise<FileSystemDirectory> {
        return {
            children: ['raw.txt', 'pretty.html', 'json.txt', 'type.txt']
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
     * @returns {Promise<SHA256Hash<HashTypes>[]>}
     * @private
     */
    private async retrieveHashesForType(type: string): Promise<SHA256Hash<HashTypes>[]> {
        const allHashes = await listAllObjectHashes();
        const hashes: SHA256Hash<HashTypes>[] = [];
        for (const hash of allHashes) {
            if ((await getFileType(hash)) === type) {
                hashes.push(hash);
            }
        }
        return hashes;
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
            return await readUTF8TextFile(parsedPath.hash as SHA256Hash);
        }

        if (parsedPath.suffix === '/pretty.html') {
            return TypesFileSystem.stringifyXML(
                await readUTF8TextFile(parsedPath.hash as SHA256Hash)
            );
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
     * @param {string} _dest
     * @returns {Promise<void>}
     */
    symlink(src: string, _dest: string): Promise<void> {
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
