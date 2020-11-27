import {BLOB, FileSystemDirectory, SHA256Hash} from '@OneCoreTypes';

export interface IFileSystem<DirectoryType, FileType> {
    onRootUpdate: ((rootHash: SHA256Hash<FileSystemDirectory>) => void) | null;

    createDir(directoryPath: string, dirName: string, dirMode: number): Promise<DirectoryType>;

    openDir(path: string): Promise<DirectoryType | undefined>;

    createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<DirectoryType>;

    openFile(filePath: string): Promise<FileType | undefined>;
}

// return type of directory a list of name for the childrens with mode
