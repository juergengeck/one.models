/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';

import ConnectionFileSystem from '../../fileSystems/ConnectionFileSystem';


/**
 * This model can bring and handle ConnectionsFilerModel file systems (see {@link ConnectionsFilerModel}).
 */
export default class ConnectionsFilerModel extends EventEmitter {
    private fs: ConnectionFileSystem | null = null;

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
        this.fs = new ConnectionFileSystem();
    }


    /**
     *
     * @returns {ConnectionFileSystem}
     */
    public get fileSystem(): ConnectionFileSystem {
        if (!this.fs) {
            throw new Error('Module was not instantiated');
        }

        return this.fs;
    }
}
