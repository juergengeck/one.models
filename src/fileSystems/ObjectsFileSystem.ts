import {
    FileSystemDirectory,
    FileSystemFile,
    FileSystemRootDirectory,
    IFileSystem
} from './IFileSystem';
import {BLOB, SHA256Hash} from '@OneCoreTypes';

// file - 0040_xxx
// dir - 0100_xxx
// symlink - 0120_xxx

// @todo wip
export default class ObjectsFileSystem implements IFileSystem {
    private readonly rootDirectory: FileSystemRootDirectory;

    constructor(
        rootDirectory: FileSystemRootDirectory = {mode: 0o0100444, root: {children: new Map()}}
    ) {
        this.rootDirectory = rootDirectory;
    }

    createDir(
        directoryPath: string,
        dirName: string,
        dirMode: number
    ): Promise<FileSystemDirectory> {
        // discuss about that because it must return something
        throw new Error('Not implemented');
    }

    async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<FileSystemFile> {
        throw new Error('Not implemented');
    }

    async openDir(dirPath: string): Promise<FileSystemDirectory | undefined> {
        throw new Error('Not implemented');
    }

    openFile(filePath: string): Promise<FileSystemFile | undefined> {
        throw new Error('Not implemented');
    }
}
