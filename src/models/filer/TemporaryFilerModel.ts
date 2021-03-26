/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';
import {TemporaryFileSystem} from '../../fileSystems';

/**
 * This model can bring and handle TemporaryFileSystem file systems (see {@link TemporaryFilerModel}).
 */
export default class TemporaryFilerModel extends EventEmitter {
    private fs: TemporaryFileSystem | null = null;

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
    public async init(rootDirPath: string) {
        this.fs = new TemporaryFileSystem(rootDirPath);
    }


    /**
     *
     * @returns {TemporaryFileSystem}
     */
    public get fileSystem(): TemporaryFileSystem {
        if (!this.fs) {
            throw new Error('Module was not instantiated');
        }

        return this.fs;
    }
}
