/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';
import {ObjectsFileSystem} from '../../fileSystems';

/**
 * This model can bring and handle ObjectsFileSystem file systems (see {@link ObjectsFilerModel}).
 */
export default class ObjectsFilerModel extends EventEmitter {
    private fs: ObjectsFileSystem | null = null;

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
        this.fs = new ObjectsFileSystem();
    }


    /**
     *
     * @returns {ObjectsFileSystem}
     */
    public get fileSystem(): ObjectsFileSystem {
        if (!this.fs) {
            throw new Error('Module was not instantiated');
        }

        return this.fs;
    }
}
