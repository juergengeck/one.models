/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';

import ConnectionFileSystem from '../../fileSystems/ConnectionFileSystem';

/**
 * This model can bring and handle different file systems (see {@link PersistentFileSystem , @link ObjectsFileSystem}).
 * Because the file systems should be independent of our data types, this model takes care of the channel's implementation
 * and can hook different events on specific file systems(e.g update event).
 */
export default class ConnectionsFilerModel extends EventEmitter {
    private fileSystem: ConnectionFileSystem | null = null;

    /**
     *
     */
    public constructor() {
        super();
    }

    /**
     * create the channel & the root directory if it does not exists
     * @returns {Promise<void>}
     */
    public async init() {
        this.fileSystem = new ConnectionFileSystem();
    }

    public get getFileSystem(): ConnectionFileSystem {
        if (!this.fileSystem) {
            throw new Error('Module was not instantiated');
        }

        return this.fileSystem;
    }
}
