import ObjectsFileSystem from './ObjectsFileSystem';
import TypesFileSystem from './TypesFileSystem';
import PersistentFileSystem from './PersistentFileSystem';
import ConnectionsFileSystem from './ConnectionFileSystem';
import TemporaryFileSystem from './TemporaryFileSystem';
import {FilerConnector, PWAConnector} from './FileSystemConnectors';

/**
 * @class
 *
 * Hooked by the ObjectsFilerModel (see {@link ObjectsFilerModel})
 *
 * See {@link ObjectsFileSystem}
 *
 * This represents a file system structure for one objects that can open directories / files on the fly.
 * This class is using {@link ObjectsFileSystem} from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 *
 * This file system is **READ-ONLY** and it's simulated. It's not persisted in one and you can't create files/directories
 * at that moment. It keeps the root directory in state (see {@link rootDirectory}) and preserve the READ-ONLY mode there.
 *
 */
export {ObjectsFileSystem};

/**
 * @class
 *
 * Hooked by the ObjectsFilerModel (see {@link TypesFilerModel})
 *
 * See {@link TypesFileSystem}
 *
 * This represents a file system structure for one objects sorted by type folders that can open directories / files on the fly.
 * This class is using {@link TypesFileSystem} from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 *
 * This file system is **READ-ONLY** and it's simulated. It's not persisted in one and you can't create files/directories
 * at that moment. It keeps the root directory in state (see {@link rootDirectory}) and preserve the READ-ONLY mode there.
 *
 */
export {TypesFileSystem};

/**
 * @class
 *
 * Hooked by the PersistentFilerModel (see {@link PersistentFilerModel})
 *
 * See {@link PersistentFileSystem}
 *
 * This represents a file system structure that can create and open directories/files and persist them in one.
 * This class is using {@link PersistentFileSystemRoot}, {@link PersistentFileSystemDirectory} and {@link PersistentFileSystemFile} Recipes &
 * {@link FileSystemDirectory} and {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure. This keeps the reference to the root in his state (see {@link rootDirectoryContent}) and
 * uses a callback to notify the {@link PersistentFilerModel} about the updates (see {@link onRootUpdate}).
 *
 */
export {PersistentFileSystem};

/**
 * @class
 *
 * Hooked by the ConnectionsFilerModel (see {@link ConnectionsFilerModel})
 *
 * See {@link ConnectionsFileSystem}
 *
 * ConnectionFileSystem represents a FileSystem Structure for connections. It provides two directories /import & /export and a connections_details.txt.
 * Those two directories contains QR codes that are generated (in /export) or imported (in /import).
 * The writing of files are only permitted inside /import directory.
 * This class is using {@link FileSystemDirectory} & {@link FileSystemFile} types from {@link IFileSystem} interface in order
 * to accomplish this FileSystem structure.
 */
export {ConnectionsFileSystem};

/**
 * @class
 *
 * Hooked by the TemporaryFilerModel (see {@link TemporaryFilerModel})
 *
 * See {@link TemporaryFileSystem}
 *
 * This represents a special File System that maps the given path to the specific file system implementation
 *
 */
export {TemporaryFileSystem};

/**
 * @class
 *
 * PWA connector between {@link ChannelManager} and {@link PersistentFileSystem}. This module allows the saving of
 * new channels items into the {@link PersistentFileSystem}.
 *
 */
export {PWAConnector};

/**
 * @class
 *
 * Filer connector between {@link PersistentFileSystem} and {@link ChannelManager}. This module allows the saving of
 * new added files into the {@link DocumentModel} channel.
 *
 */
export {FilerConnector};
