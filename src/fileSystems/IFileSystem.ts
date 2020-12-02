import {BLOB, SHA256Hash} from '@OneCoreTypes';

/**
 * File structure wrapper
 */
export interface FileSystemFile {
    mode: number;
    content: ArrayBuffer | SHA256Hash<BLOB>;
}

/**
 * Entry structure for FileSystemDirectory
 * content is optional because the entry can be a directory or a file. If the content it's a directory then no content is needed
 */
export interface FileSystemDirectoryEntry {
    mode: number;
    content?: FileSystemFile['content'];
}

export interface FileSystemDirectory {
    children: Map<string, FileSystemDirectoryEntry>;
}

/**
 * the root structure that keeps the mode and the root entry
 */
export interface FileSystemRootDirectory {
    mode: number;
    root: FileSystemDirectory;
}

/**
 * Common file system interface for future file systems implementations. In order to achieve this, any
 * file system's implementation will have to implement those functions and transform their data to match function
 * signatures
 */
export interface IFileSystem {
    /**
     * Throws error of the directory could not be created
     * @param {string} directoryPath
     * @param {string} dirName
     * @param {number} dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(
        directoryPath: string,
        dirName: string,
        dirMode: number
    ): Promise<FileSystemDirectory>;

    /**
     * Throws error if the file could not be created
     * @param {string} directoryPath
     * @param {SHA256Hash<BLOB>} fileHash
     * @param {string} fileName
     * @param {number} fileMode
     * @returns {Promise<FileSystemFile>}
     */
    createFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode: number
    ): Promise<FileSystemFile>;

    /**
     * Returns undefined if the directory could not be found
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    openDir(dirPath: string): Promise<FileSystemDirectory | undefined>;

    /**
     * Returns undefined if the file could not be found
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    openFile(filePath: string): Promise<FileSystemFile | undefined>;
}
