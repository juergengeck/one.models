/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';
import {ObjectsFileSystem} from '../../fileSystems';

/**
 * This model can bring and handle ObjectsFileSystem file systems (see {@link PersistentFileSystem , @link ObjectsFileSystem}).
 * Because the file systems should be independent of our data types, this model takes care of the channel's implementation
 * and can hook different events on specific file systems(e.g update event).
 */
export default class ObjectsFilerModel extends EventEmitter {
    private fileSystem: ObjectsFileSystem | null = null;

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
        this.fileSystem = new ObjectsFileSystem();
    }

    public get getFileSystem(): ObjectsFileSystem {
        if (!this.fileSystem) {
            throw new Error('Module was not instantiated');
        }

        return this.fileSystem;
    }
}
