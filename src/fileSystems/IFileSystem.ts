import {BLOB, SHA256Hash} from '@OneCoreTypes';

/**
 * This interface the main structure for files
 */
export interface FileSystemFile {
    /**
     * The file's content can be either ArrayBuffer or a reference to a BLOB
     */
    content: ArrayBuffer;
}

/**
 * This interface represents the file/directory description structure for {@link FileSystemDirectory or @link FileSystemFile}
 */
export interface FileDescription {
    /**
     * The file mode {@link FileOptions}
     */
    mode: number;
    /**
     * The size of the file
     */
    size: number;
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
     * @param {number} dirMode
     * @returns {Promise<FileSystemDirectory>}
     */
    createDir(directoryPath: string, dirMode: number): Promise<void>;

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
     * Opens a directory otherwise throws error if the directory could not be found.
     * @param {string} dirPath
     * @returns {Promise<FileSystemDirectory | undefined>}
     */
    readDir(dirPath: string): Promise<FileSystemDirectory>;

    /**
     * Opens a file otherwise throws error if the file could not be found.
     * @param {string} filePath
     * @returns {Promise<FileSystemFile | undefined>}
     */
    readFile(filePath: string): Promise<FileSystemFile>;

    /**
     * Reads a symlink. Return 0 for success or an error code and the pointed path
     *
     * @param {string} filePath
     * @returns {Promise<number>}
     */
    readlink(filePath: string): Promise<FileSystemFile>;

    /**
     * Reads file in chunks.
     * @param {string} filePath
     * @param length
     * @param position
     * @returns {Promise<FileSystemFile>}
     */
    readFileInChunks(filePath: string, length: number, position: number): Promise<FileSystemFile>;

    /**
     * If file reading in chunks is supported on the current platform.
     * @param {string} path
     * @returns {boolean}
     */
    supportsChunkedReading(path?: string): boolean;
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
    // exists(path: string): Promise<boolean>;

    /**
     * Deletes a directory. Return 0 for success or an error code
     * @param {string} pathName
     * @returns {Promise<number>}
     */
    rmdir(pathName: string): Promise<number>;

    /**
     * Deletes a file or a symlink. Return 0 for success or an error code
     * @param {string} pathName
     * @returns {Promise<number>}
     */
    unlink(pathName: string): Promise<number>;

    /**
     * Creates a hardlink. Return 0 for success or an error code
     * @param {string} src
     * @param {string} dest
     * @todo options do we needed them now?
     * @returns {Promise<number>}
     */
    // link(src: string, dest: string): Promise<number>;

    /**
     * Creates a symlink. Return 0 for success or an error code
     * @param {string} src
     * @param {string} dest
     * @returns {Promise<void>}
     */
    symlink(src: string, dest: string): Promise<void>;

    /**
     * Rename file. Return 0 for success or an error code
     * @param {string} src
     * @param {string} dest
     * @returns {Promise<number>}
     */
    rename(src: string, dest: string): Promise<number>;

    /**
     * Change the permissions. Return 0 for success or an error code
     * @param {string} pathName
     * @param {number} mode
     * @returns {Promise<number>}
     */
    chmod(pathName: string, mode: number): Promise<number>;
}
