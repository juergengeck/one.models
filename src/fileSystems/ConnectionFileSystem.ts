import {FileDescription, FileSystemDirectory, FileSystemFile, IFileSystem} from './IFileSystem';
import {retrieveFileMode} from './fileSystemModes';
import {BLOB, SHA256Hash} from '@OneCoreTypes';
import {ConnectionInfo} from '../misc/CommunicationModule';
import {readBlobAsArrayBuffer} from 'one.core/lib/storage';
import {NotImplementedError, PermissionsRequiredError} from './FSErrors';

/**
 * Json format for the connectionsFS path
 */
type ParsedConnectionsPath = {
    isRoot: boolean;
    isImportPath: boolean;
    isExportPath: boolean;
    isDetailsPath: boolean;
};

/**
 * ConnectionFileSystem represents a FileSystem Structure for connections. It provides two directories /import & /export and a connections_details.txt.
 * Those two directories contains QR codes that are generated (in /export) or imported (in /import).
 * The writing of files are only permitted inside /import directory.
 * This class is using {@link FileSystemDirectory} & {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 */
export default class ConnectionFileSystem implements IFileSystem {
    private readonly rootMode: number = 0o0400555;

    /**
     * Handler in order to provide QR code & connections info functionalities. Usually passed from {@link FilerModel}
     */
    public onConnectionQRCodeRequested: (() => Promise<Buffer>) | null = null;
    public onConnectionQRCodeReceived: ((qrContent: ArrayBuffer) => Promise<void>) | null = null;
    public onConnectionsInfoRequested: (() => ConnectionInfo[]) | null = null;

    /**
     * Those {@link FileSystemFile} are only persisted temporary in the fs. The reason behind that is to see them inside
     * the folder after importing them.
     * @type {Map<string, FileSystemFile>}
     * @private
     */
    private importedQRCodesMap: Map<string, {qrHash: SHA256Hash<BLOB>}>;

    /**
     * The QR code is refreshed every 5 minutes (3 * 10^5 ms) and it's temporary persisted.
     * @type {FileSystemFile | null}
     * @private
     */
    private exportedQRCode: FileSystemFile | null = null;

    constructor() {
        this.importedQRCodesMap = new Map();
        /** refresh the qr code every 5 minutes **/
        setInterval(async () => {
            await this.refreshQRCode();
        }, 300000);
    }

    /**
     * The current Connection File System is not supporting the creation of directories.
     * @param {string} directoryPath
     * @param {number} dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(directoryPath: string, dirMode: number): Promise<void> {
        const rootMode = retrieveFileMode(this.rootMode);
        if (!rootMode.permissions.owner.write) {
            throw new PermissionsRequiredError('Error: Permissions required.');
        } else {
            throw new NotImplementedError('Error: not implemented.');
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
            this.importedQRCodesMap.set(fileName, {qrHash: fileHash});
            if (this.onConnectionQRCodeReceived) {
                await this.onConnectionQRCodeReceived(fileContent);
            }
        } else {
            const rootMode = retrieveFileMode(this.rootMode);
            if (!rootMode.permissions.owner.write) {
                throw new PermissionsRequiredError('Error: Permissions required.');
            } else {
                throw new NotImplementedError('Error: not implemented.');
            }
        }
    }

    /**
     * If the given path exists
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async exists(path: string): Promise<boolean> {
        return !!this.parsePath(path);
    }

    /**
     * Read the given directory
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory>}
     */
    async readDir(dirPath: string): Promise<FileSystemDirectory> {
        const parsedPath = this.parsePath(dirPath);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isRoot) {
            return {children: ['import', 'export', 'connections_details.txt']};
        }

        if (parsedPath.isImportPath) {
            return {children: Array.from(this.importedQRCodesMap.keys())};
        }

        if (parsedPath.isExportPath) {
            return {children: ['invited_qr_code.png']};
        }

        throw new Error('Error: the path could not be found.');
    }

    /**
     * Read the given file
     * @param {string} filePath
     * @returns {Promise<FileSystemFile>}
     */
    async readFile(filePath: string): Promise<FileSystemFile> {
        const parsedPath = this.parsePath(filePath);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isDetailsPath) {
            if (this.onConnectionsInfoRequested) {
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
            if (!this.exportedQRCode && this.onConnectionQRCodeRequested) {
                await this.refreshQRCode();
            }

            if (this.exportedQRCode) {
                return {
                    content: this.exportedQRCode.content
                };
            }
        }

        if (parsedPath.isImportPath && filePath.includes('import/')) {
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const file = this.importedQRCodesMap.get(fileName);
            if (file) {
                const fileContent = await readBlobAsArrayBuffer(file.qrHash);
                return {
                    content: fileContent
                };
            }
        }

        throw new Error('Error: the path could not be found.');
    }

    /**
     * Only allowed on node. See {@link this.supportsChunkedReading}
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
        const parsedPath = this.parsePath(filePath);

        if (!this.supportsChunkedReading()) {
            throw new Error('Error: reading file in chunks is not supported.');
        }

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isDetailsPath) {
            if (this.onConnectionsInfoRequested) {
                const content = this.onConnectionsInfoRequested();
                return {
                    content: ConnectionFileSystem.stringToArrayBuffer(
                        JSON.stringify(content)
                    ).slice(position, position + length)
                };
            }
        }

        if (
            parsedPath.isExportPath &&
            filePath.substring(filePath.lastIndexOf('/') + 1) === 'invited_qr_code.png'
        ) {
            if (this.exportedQRCode) {
                return {
                    content: this.exportedQRCode.content.slice(position, position + length)
                };
            }
        }

        if (parsedPath.isImportPath && filePath.includes('import/')) {
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
            const file = this.importedQRCodesMap.get(fileName);
            if (file) {
                const fileContent = await readBlobAsArrayBuffer(file.qrHash);
                return {
                    content: fileContent
                };
            }
        }

        throw new Error('Error: the path could not be found.');
    }

    /**
     * @param pathName
     * @param mode
     */
    async chmod(pathName: string, mode: number): Promise<number> {
        const pathInfo = await this.stat(pathName);
        const pathPermissions = retrieveFileMode(pathInfo.mode).permissions;
        if (!pathPermissions.owner.write) {
            throw new PermissionsRequiredError('Error: Permissions required.');
        }
        return 0;
    }

    /**
     * @param src
     * @param dest
     */
    async rename(src: string, dest: string): Promise<number> {
        const parsedPath = this.parsePath(src);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        const pathInfo = await this.stat(src);
        const pathPermissions = retrieveFileMode(pathInfo.mode).permissions;

        if (!pathPermissions.owner.write) {
            throw new PermissionsRequiredError('Error: Permissions required.');
        }

        if (parsedPath.isImportPath) {
            const fileName = src.substring(src.lastIndexOf('/') + 1);
            const desiredFileName = dest.substring(dest.lastIndexOf('/') + 1);
            const foundFile = this.importedQRCodesMap.get(fileName);
            if (foundFile) {
                this.importedQRCodesMap.set(desiredFileName, foundFile);
                return 0;
            } else {
                return -2;
            }
        }

        return -2;
    }

    /**
     * @param pathName
     */
    async rmdir(pathName: string): Promise<number> {
        const pathInfo = await this.stat(pathName);
        const pathPermissions = retrieveFileMode(pathInfo.mode).permissions;
        if (!pathPermissions.owner.write) {
            throw new PermissionsRequiredError('Error: Permissions required.');
        }

        // HACK - this is because write permissions exists for the import directory,
        // but it's not the best idea to let the user deleted it.
        throw new PermissionsRequiredError('Error: Permissions required.');
    }

    /**
     * @param pathName
     */
    async unlink(pathName: string): Promise<number> {
        const parsedPath = this.parsePath(pathName);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        const pathInfo = await this.stat(pathName);
        const pathPermissions = retrieveFileMode(pathInfo.mode).permissions;

        if (!pathPermissions.owner.write) {
            throw new PermissionsRequiredError('Error: Permissions required.');
        }

        if (parsedPath.isImportPath) {
            const fileName = pathName.substring(pathName.lastIndexOf('/') + 1);
            const foundFile = this.importedQRCodesMap.delete(fileName);
            if (foundFile) {
                return 0;
            } else {
                return -2;
            }
        }

        return -2;
    }

    /**
     * Stats about the given path
     * @param {string} path
     * @returns {Promise<FileDescription>}
     */
    async stat(path: string): Promise<FileDescription> {
        const parsedPath = this.parsePath(path);

        if (!parsedPath) {
            throw new Error('Error: the path could not be found.');
        }

        if (parsedPath.isRoot) {
            return {mode: this.rootMode, size: 0};
        }

        if (
            parsedPath.isDetailsPath ||
            (parsedPath.isExportPath &&
                path.substring(path.lastIndexOf('/') + 1) === 'invited_qr_code.png') ||
            (parsedPath.isImportPath && path.includes('import/'))
        ) {
            const file = await this.readFile(path);
            if (file) {
                return {mode: 0o0100444, size: file.content.byteLength};
            }
        }

        if (parsedPath.isExportPath) {
            return {mode: 0o0040555, size: 0};
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

    /**
     * Request a new QR code.
     * @returns {Promise<void>}
     * @private
     */
    private async refreshQRCode() {
        if (this.onConnectionQRCodeRequested) {
            const qrCodeAsBuffer: Buffer = await this.onConnectionQRCodeRequested();
            this.exportedQRCode = {content: new Uint8Array(qrCodeAsBuffer).buffer};
        }
    }
}
