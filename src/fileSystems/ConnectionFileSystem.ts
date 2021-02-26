import {FileDescription, FileSystemDirectory, FileSystemFile, IFileSystem} from './IFileSystem';
import {retrieveFileMode} from './fileSystemModes';
import {BLOB, SHA256Hash} from '@OneCoreTypes';
import {PairingInformation} from '../models/ConnectionsModel';
import {ConnectionInfo} from '../misc/CommunicationModule';
import {readBlobAsArrayBuffer} from 'one.core/lib/storage';

/**
 * Json format for the objects parsed path
 */
type ParsedConnectionsPath = {
    isRoot: boolean;
    isImportPath: boolean;
    isExportPath: boolean;
    isDetailsPath: boolean;
};

export default class ConnectionFileSystem implements IFileSystem {
    private readonly rootMode: number = 0o0100444;

    public onConnectionQRCodeRequested: (() => Promise<Buffer>) | null = null;
    public onConnectionQRCodeReceived: ((pairingInformation: PairingInformation) => Promise<void>) | null = null;
    public onConnectionsInfoRequested: (() => ConnectionInfo[]) | null = null;

    private importedQrFilesMap: Map<string, FileSystemFile>;

    constructor() {
        this.importedQrFilesMap = new Map();
    }

    /**
     * The current Connection File System is not supporting the creation of directories.
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
     * The current Connection File System is supporting the creation of files only for /import path.
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
        const parsedPath = this.parsePath(directoryPath);
        if (parsedPath && parsedPath.isImportPath) {
            const fileContent = await readBlobAsArrayBuffer(fileHash);
            this.importedQrFilesMap.set(fileName, {content: fileContent});
            const pairingInformation = JSON.parse(
                // @ts-ignore
                String.fromCharCode.apply(null, new Uint16Array(fileContent))
            );
            if(this.onConnectionQRCodeReceived) {
                await this.onConnectionQRCodeReceived(pairingInformation);
            }
        } else {
            const rootMode = retrieveFileMode(this.rootMode);
            if (!rootMode.permissions.owner.write) {
                throw new Error('Error: write permission required.');
            } else {
                throw new Error('Error: not implemented.');
            }
        }
    }

    async exists(path: string): Promise<boolean> {
        return !!this.parsePath(path);
    }

    async readDir(dirPath: string): Promise<FileSystemDirectory> {
        const parsedPath = this.parsePath(dirPath);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isRoot) {
            return {children: ['import', 'export', 'connections_details.txt']};
        }

        if (parsedPath.isImportPath) {
            return {children: []};
        }

        if (parsedPath.isExportPath) {
            return {children: ['invited_qr_code.png']};
        }

        throw new Error('Error: the path could not be found.');
    }

    async readFile(filePath: string): Promise<FileSystemFile> {
        const parsedPath = this.parsePath(filePath);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isDetailsPath) {
            if(this.onConnectionsInfoRequested) {
                const content = this.onConnectionsInfoRequested();
                return {
                    content: ConnectionFileSystem.stringToArrayBuffer(JSON.stringify(content))
                };
            }
        }

        if (
            parsedPath.isExportPath &&
            filePath.substring(filePath.lastIndexOf('/') + 1) === 'invited_qr_code.png'
        ) {
            if(this.onConnectionQRCodeRequested) {
                const content = await this.onConnectionQRCodeRequested();
                return {
                    content: new Uint8Array(content).buffer
                };
            }
        }

        if (parsedPath.isImportPath && filePath.includes('import/')) {
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const fileContent = this.importedQrFilesMap.get(fileName);
            if (fileContent) {
                return {
                    content: fileContent.content
                };
            }
        }

        throw new Error('Error: the path could not be found.');
    }

    async readFileInChunks(
        filePath: string,
        length: number,
        position: number
    ): Promise<FileSystemFile> {
        const parsedPath = this.parsePath(filePath);

        if (!this.supportsChunkedReading()) {
            throw new Error('Error: reading file in chunks is not supported.');
        }

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isDetailsPath) {
            if(this.onConnectionsInfoRequested) {
                const content = this.onConnectionsInfoRequested();
                return {
                    content: ConnectionFileSystem.stringToArrayBuffer(JSON.stringify(content)).slice(
                        position,
                        position + length
                    )
                };
            }
        }

        if (
            parsedPath.isExportPath &&
            filePath.substring(filePath.lastIndexOf('/') + 1) === 'invited_qr_code.png'
        ) {
            if(this.onConnectionQRCodeRequested) {
                const content = await this.onConnectionQRCodeRequested();

                return {
                    content: new Uint8Array(content).buffer.slice(
                        position,
                        position + length
                    )
                };
            }
        }

        if (parsedPath.isImportPath && filePath.includes('import/')) {
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const fileContent = this.importedQrFilesMap.get(fileName);
            if (fileContent) {
                return {
                    content: fileContent.content
                };
            }
        }

        throw new Error('Error: the path could not be found.');
    }

    async stat(path: string): Promise<FileDescription> {
        const parsedPath = this.parsePath(path);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isRoot) {
            return {mode: 0o0040555, size: 0};
        }

        if (
            parsedPath.isDetailsPath ||
            (parsedPath.isExportPath &&
                path.substring(path.lastIndexOf('/') + 1) === 'invited_qr_code.png') ||
            (parsedPath.isImportPath && path.includes('import/'))
        ) {
            const file = await this.readFile(path);
            if (file) {
                return {mode: 0o0100644, size: file.content.byteLength};
            }
        }

        if (parsedPath.isExportPath) {
            return {mode: 0o0040444, size: 0};
        }

        if (parsedPath.isImportPath) {
            return {mode: 0o0040777, size: 0};
        }

        throw new Error('Error: the path could not be found.');
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
     * Parses the given path.
     * @param {string} path
     * @returns {ParsedConnectionsPath}
     * @private
     */
    public parsePath(path: string): ParsedConnectionsPath | undefined {
        if (path === '/') {
            return {
                isRoot: true,
                isImportPath: false,
                isExportPath: false,
                isDetailsPath: false
            };
        }
        if (path === '/connections_details.txt') {
            return {
                isRoot: false,
                isImportPath: false,
                isExportPath: false,
                isDetailsPath: true
            };
        }
        if (path.includes('/import')) {
            return {
                isRoot: false,
                isImportPath: true,
                isExportPath: false,
                isDetailsPath: false
            };
        }
        if (path.includes('/export')) {
            return {
                isRoot: false,
                isImportPath: false,
                isExportPath: true,
                isDetailsPath: false
            };
        }

        return undefined;
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
}
