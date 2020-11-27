import {IFileSystem} from './IFileSystem';
import {BLOB, SHA256Hash, FileSystemDirectory} from '@OneCoreTypes';

export default class ObjectsFileSystem implements IFileSystem<string[], string> {
    onRootUpdate: ((rootHash: SHA256Hash<FileSystemDirectory>) => void) | null = null;

    public async createDir(
        directoryPath: string,
        dirName: string,
        dirMode: number
    ): Promise<string[]> {
        return [];
    }

    public async openDir(path: string): Promise<string[] | undefined> {
        return ['1', '2'];
    }

    public async createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<string[]> {
        return [];
    }

    public async openFile(filePath: string): Promise<string | undefined> {
        return 'fds';
    }
}
