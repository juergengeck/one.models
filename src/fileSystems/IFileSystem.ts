import {BLOB, SHA256Hash} from '@OneCoreTypes';

/**
 * This interface the main structure for files
 */
export interface FileSystemFile {
    /**
     * The file's content can be either ArrayBuffer or a reference to a BLOB
     */
    content: ArrayBuffer | SHA256Hash<BLOB>;
}

/**
 * This interface represents the file/directory description structure for {@link FileSystemDirectory or @link FileSystemFile}
 */
export interface FileDescription {
    /**
     * The file mode {@link FileOptions}
     */
    mode: number;
}

/**
 * This interface represents the main structure for directories.
 */
export interface FileSystemDirectory {
    /**
     * Represents the content of the directory.
     */
    children: string[];
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
    createDir(directoryPath: string, dirName: string, dirMode: number): Promise<void>;

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
    ): Promise<void>;

    /**
     * Opens a directory otherwise returns undefined if the directory could not be found.
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    readDir(dirPath: string): Promise<FileSystemDirectory | undefined>;

    /**
     * Opens a file otherwise returns undefined if the file could not be found.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    readFile(filePath: string): Promise<FileSystemFile | undefined>;

    /**
     * Returns the mode (in the future it may return the last access/change/modify timestamp
     * @param {string} path
     * @returns {Promise<FileDescription>}
     */
    stat(path: string): Promise<FileDescription>;

    /**
     * See if the file/directory can be opened
     * @param {string} path
     * @returns {Promise<void>}
     */
    open(path: string): Promise<void>;
}
