import {FileDescription, FileSystemDirectory, FileSystemFile, IFileSystem} from './IFileSystem';
import {BLOB, HashTypes, SHA256Hash} from '@OneCoreTypes';
import {retrieveFileMode} from './fileSystemModes';
import {getFileType, getObject, getTextFile, listAllObjectHashes} from 'one.core/lib/storage';

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
    private readonly rootMode: number = 0o0100444;
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
        const rootMode = retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw new Error('Error: write permission required.');
        } else {
            throw new Error('Error: not implemented.');
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
            throw new Error('Error: reading file in chunks is not supported.');
        }

        const content = await this.retrieveContentAboutHash(filePath);
        if (!content) {
            throw new Error('Error: file could not be found.');
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
        const rootMode = retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw new Error('Error: write permission required.');
        } else {
            throw new Error('Error: not implemented.');
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
            throw new Error('Error: directory could not be found.');
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
        throw new Error('Error: directory could not be found.');
    }

    /**
     * Opens the file on-the-fly.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    async readFile(filePath: string): Promise<FileSystemFile> {
        const content = await this.retrieveContentAboutHash(filePath);
        if (!content) {
            throw new Error('Error: file could not be found.');
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
            return {mode: 0o0040555, size: 0};
        }
        if (
            parsedPath.suffix === '/raw.txt' ||
            parsedPath.suffix === '/pretty.txt' ||
            parsedPath.suffix === '/json.txt' ||
            parsedPath.suffix === '/type.txt'
        ) {
            const file = await this.readFile(path);
            if (file) {
                return {mode: 0o0100644, size: file.content.byteLength};
            }
        }
        if (parsedPath.suffix === '/moduleHash') {
            return {mode: 0o0120000, size: 0};
        }
        throw new Error('Not found');
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
        if (parsedPath.suffix === '/raw.txt') {
            return await getTextFile(parsedPath.hash as SHA256Hash);
        }

        if (parsedPath.suffix === '/pretty.txt') {
            return ObjectsFileSystem.stringifyXML(await getTextFile(parsedPath.hash as SHA256Hash));
        }

        if (parsedPath.suffix === '/json.txt') {
            return JSON.stringify(await getObject(parsedPath.hash as SHA256Hash), null, '  ');
        }

        if (parsedPath.suffix === '/type.txt') {
            const fileType = await getFileType(parsedPath.hash as SHA256Hash);
            if (fileType === 'BLOB' || fileType === 'CBLOB') {
                return fileType;
            } else {
                return (await getObject(parsedPath.hash as SHA256Hash)).$type$;
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
}
