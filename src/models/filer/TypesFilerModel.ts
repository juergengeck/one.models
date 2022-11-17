/**
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {EventEmitter} from 'events';
import {TypesFileSystem} from '../../fileSystems';

/**
 * This model can bring and handle TypesFileSystem file systems
 */
export default class TypesFilerModel extends EventEmitter {
    private fs: TypesFileSystem | null = null;
    private shutdownInternal: () => Promise<void> = async () => {};

    public constructor() {
        super();
    }

    /**
     * create the channel & the root directory if it does not exist
     * @returns {Promise<void>}
     */
    public async init() {
        this.fs = new TypesFileSystem();
    }

    /**
     * Shutdown the TypesFilerModel model
     */
    public async shutdown(): Promise<void> {
        await this.shutdownInternal();
    }

    /**
     * @returns {TypesFileSystem}
     */
    public get fileSystem(): TypesFileSystem {
        if (!this.fs) {
            throw new Error('Module was not instantiated');
        }

        return this.fs;
    }
}
