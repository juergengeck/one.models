import type {
    FileDescription,
    FileSystemDirectory,
    FileSystemFile,
    IFileSystem
} from './IFileSystem';
import {createError} from '@refinio/one.core/lib/errors';
import {FS_ERRORS} from './FileSystemErrors';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {BLOB} from '@refinio/one.core/lib/recipes';
import type ConnectionsModel from '../models/ConnectionsModel';
import type {LeuteModel} from '../models';
import {prettifySomeoneWithKeysAndInstances} from './utils/DebugDataFormatters';

/**
 * This file systems provides pairing information so that other instances can pair to this instance.
 *
 * Pairing information is provided as QR-Code and invite url as text. The following files exist:
 * - /iom_invite.png: QR invite for IoM pairing - This will automatically create an IoM Request
 *                    after successful pairing.
 * - /iom_invite.txt: URL invite for IoM pairing - This will automatically create an IoM Request
 *                    after successful pairing.
 * - /iop_invite.png: QR invite for IoP pairing
 * - /iop_invite.txt: URL invite for IoP pairing
 *
 */
export default class DebugFileSystem implements IFileSystem {
    private readonly connectionsModel: ConnectionsModel;
    private readonly leuteModel: LeuteModel;

    // Internally used list of provided files
    private static readonly files = ['connections.txt', 'my_identities.txt'];

    /**
     * Constructor
     *
     * @param leuteModel
     * @param connectionsModel
     */
    constructor(leuteModel: LeuteModel, connectionsModel: ConnectionsModel) {
        this.connectionsModel = connectionsModel;
        this.leuteModel = leuteModel;
    }

    async createDir(directoryPath: string, dirMode: number): Promise<void> {
        throw await this.getNoWritePermissionError(directoryPath);
    }

    async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<void> {
        throw await this.getNoWritePermissionError(directoryPath);
    }

    async exists(path: string): Promise<boolean> {
        // remove the leading '/' with slice
        return DebugFileSystem.files.includes(path.slice(1));
    }

    async readDir(dirPath: string): Promise<FileSystemDirectory> {
        if (dirPath !== '/') {
            throw createError('FSE-ENOENT', {
                message: FS_ERRORS['FSE-ENOENT'].message,
                path: dirPath
            });
        }

        return {children: DebugFileSystem.files};
    }

    async readFile(filePath: string): Promise<FileSystemFile> {
        let content: string;

        switch (filePath) {
            case '/connections.txt':
                content = JSON.stringify(this.connectionsModel.connectionsInfo(), null, 4);
                break;
            case '/my_identities.txt':
                const me = await this.leuteModel.me();
                content = JSON.stringify(await prettifySomeoneWithKeysAndInstances(me), null, 4);
                break;
            default:
                throw createError('FSE-ENOENT', {
                    message: FS_ERRORS['FSE-ENOENT'].message,
                    path: filePath
                });
        }

        return {
            content: new TextEncoder().encode(content)
        };
    }

    async readFileInChunks(
        filePath: string,
        length: number,
        position: number
    ): Promise<FileSystemFile> {
        return {
            content: (await this.readFile(filePath)).content.slice(position, position + length)
        };
    }

    async chmod(pathName: string, mode: number): Promise<number> {
        throw await this.getNoWritePermissionError(pathName);
    }

    async rename(src: string, dest: string): Promise<number> {
        throw await this.getNoWritePermissionError(dest);
    }

    async rmdir(pathName: string): Promise<number> {
        throw await this.getNoWritePermissionError(pathName);
    }

    async unlink(pathName: string): Promise<number> {
        throw await this.getNoWritePermissionError(pathName);
    }

    async stat(path: string): Promise<FileDescription> {
        if (path === '/') {
            return {mode: 0o0040555, size: 0};
        }

        if (await this.exists(path)) {
            const file = await this.readFile(path);
            if (file) {
                return {mode: 0o0100444, size: file.content.byteLength};
            }
        }

        throw createError('FSE-ENOENT', {message: FS_ERRORS['FSE-ENOENT'].message, path: path});
    }

    async symlink(src: string, dest: string): Promise<void> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'symlink()',
            path: src
        });
    }

    async readlink(filePath: string): Promise<FileSystemFile> {
        throw createError('FSE-ENOSYS', {
            message: FS_ERRORS['FSE-ENOSYS'].message,
            functionName: 'readLink()',
            path: filePath
        });
    }

    supportsChunkedReading(path?: string): boolean {
        return true;
    }

    /**
     * This will construct the appropriate error for not having write permissions.
     *
     * If the file does not exist, then it will return ENOENT, otherwise it will return EACCESS.
     *
     * @param path
     */
    private async getNoWritePermissionError(path: string): Promise<Object> {
        if (await this.exists(path)) {
            return createError('FSE-ENOENT', {
                message: FS_ERRORS['FSE-ENOENT'].message,
                path
            });
        } else {
            return createError('FSE-EACCES-W', {
                message: FS_ERRORS['FSE-EACCES-W'].message,
                path
            });
        }
    }
}
