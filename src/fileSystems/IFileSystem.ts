import {BLOB, SHA256Hash} from '@OneCoreTypes';

/**
 * This interface the main structure for files
 */
export interface FileSystemFile {
    /**
     * The file mode {@link FileOptions}
     */
    mode: number;
    /**
     * The file's content can be either ArrayBuffer or a reference to a BLOB
     */
    content: ArrayBuffer | SHA256Hash<BLOB>;
}

/**
 * This interface represents the entry structure for {@link FileSystemDirectory}
 */
export interface FileSystemDirectoryEntry {
    /**
     * The file mode {@link FileOptions}
     */
    mode: number;
    /**
     * Content is optional because the entry can be a directory or a file. If the content it's a directory then no content is needed.
     */
    content?: FileSystemFile['content'];
}

/**
 * This interface represents the main structure for directories.
 */
export interface FileSystemDirectory {
    /**
     * Represents the content of the directory.
     */
    children: Map<string, FileSystemDirectoryEntry>;
}

/**
 * This interface represents the root structure that keeps the mode and the root's entry
 */
export interface FileSystemRootDirectory {
    /**
     * The file mode {@link FileOptions}
     */
    mode: number;
    /**
     * The root FileSystemDirectory
     */
    root: FileSystemDirectory;
}

/**
 * @global
 * Common file system interface for future file systems implementations. In order to achieve this, any
 * file system will have to implement those functions and transform their data in order to match function's
 * signatures.
 */
export interface IFileSystem {
    /**
     * Creates a directory otherwise throws an error if the directory could not be created.
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
     * Creates a file otherwise throws an error if the file could not be created.
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
     * Opens a directory otherwise returns undefined if the directory could not be found.
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    openDir(dirPath: string): Promise<FileSystemDirectory | undefined>;

    /**
     * Opens a file otherwise returns undefined if the file could not be found.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    openFile(filePath: string): Promise<FileSystemFile | undefined>;
}
