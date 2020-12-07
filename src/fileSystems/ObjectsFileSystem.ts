import {
    FileDescription,
    FileSystemDirectory,
    FileSystemFile,
    IFileSystem
} from './IFileSystem';
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
     * @param {string} dirName
     * @param {number} dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(directoryPath: string, dirName: string, dirMode: number): Promise<void> {
        const rootMode = retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw new Error('Error: write permission required.');
        } else {
            throw new Error('Error: not implemented.');
        }
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
    async readDir(dirPath: string): Promise<FileSystemDirectory | undefined> {
        const parsedPath = this.parsePath(dirPath);
        const hashMap = await this.retrieveHashesWithType();

        /** if it is the root path **/
        if (parsedPath.isRoot) {
            return {children: Array.from(hashMap.keys())};
        }

        /** Handle malformed path / not a valid one hash **/
        if (!parsedPath.hash) {
            return undefined;
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
        return undefined;
    }

    /**
     * Opens the file on-the-fly.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    async readFile(filePath: string): Promise<FileSystemFile | undefined> {
        const content = await this.retrieveContentAboutHash(filePath);
        if (!content) {
            return undefined;
        }
        try {
            const contentAsArrayBuffer = await this.stringToArrayBuffer(content, 'UTF-8');
            return {content: contentAsArrayBuffer};
        } catch (e) {
            throw new Error('Error: file could not be opened.');
        }
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<void>}
     */
    public async open(path: string): Promise<void> {
        const parsedPath = this.parsePath(path);
        if (parsedPath.hash) {
            /** check if the hash exists **/
            await getObject(parsedPath.hash as SHA256Hash).catch(ignored => {
                throw new Error('Error: the path could not be found.');
            });
        }
        /** check if its one of those hardcoded file's name **/
        if (
            parsedPath.suffix &&
            !['raw', 'type', 'pretty', 'json', 'moduleHash'].includes(parsedPath.suffix)
        ) {
            throw new Error('Error: the path could not be found.');
        }
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FileDescription>}
     */
    async stat(path: string): Promise<FileDescription> {
        const parsedPath = this.parsePath(path);
        return {mode: parsedPath.isRoot || parsedPath.hash ? 0o0100444 : 0o0040444};
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
            children: ['/raw', '/type']
        };
    }

    /**
     * Retrieves directory content for Plan hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForPlans(): Promise<FileSystemDirectory> {
        return {
            children: ['/raw', '/pretty', '/json', '/type', '/moduleHash']
        };
    }

    /**
     * Retrieves directory content for regular hashes.
     * @returns {Promise<FileSystemDirectory>}
     * @private
     */
    private static async returnDirectoryContentForRegularObject(): Promise<FileSystemDirectory> {
        return {
            children: ['/raw', '/pretty', '/json', '/type']
        };
    }

    /**
     * Converts string to an Array Buffer.
     * @param {string} text
     * @param {string} encoding
     * @private
     */
    private async stringToArrayBuffer(
        text: string,
        encoding: string = 'UTF-8'
    ): Promise<ArrayBuffer> {
        const blob = new Blob([text], {type: 'text/plain;charset=' + encoding});
        const reader = new FileReader();
        const promiseOnLoad: Promise<ArrayBuffer> = new Promise((resolve, rejected) => {
            reader.onload = function (evt: ProgressEvent<FileReader>) {
                if (
                    evt.target === null ||
                    evt.target.result === null ||
                    !(evt.target.result instanceof ArrayBuffer)
                ) {
                    rejected();
                    return;
                }
                resolve(evt.target.result);
            };
        });
        reader.readAsArrayBuffer(blob);
        return promiseOnLoad;
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
        if (parsedPath.suffix === '/raw') {
            return await getTextFile(parsedPath.hash as SHA256Hash);
        }

        if (parsedPath.suffix === '/pretty') {
            return ObjectsFileSystem.stringifyXML(await getTextFile(parsedPath.hash as SHA256Hash));
        }

        if (parsedPath.suffix === '/json') {
            return JSON.stringify(await getObject(parsedPath.hash as SHA256Hash), null, '  ');
        }

        if (parsedPath.suffix === '/type') {
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
