import {clone} from 'one.core/lib/util/clone-object';
import {stringify} from 'one.core/lib/util/sorted-stringify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {createMessageBus} from 'one.core/lib/message-bus';
const MessageBus = createMessageBus('NodeStorage');

type KeyValueStorageOptions = {
    dir: string;
};

type Entry = {
    key: string;
    value: string;
};

type CreatedEntryResult = {file: string; value: Entry['value']};
type RemovedEntryResult = {file: string; removed: boolean};

/**
 * Key Value Storage for NodeJS similar to LocalStorage(WEB)
 */
export default class NodeLightStorage implements Storage {
    private readonly options: KeyValueStorageOptions = {
        dir: './storage'
    };

    /**
     *
     * @param {KeyValueStorageOptions} options
     * @returns {NodeLightStorage}
     */
    constructor(options?: KeyValueStorageOptions) {
        if (options !== undefined) {
            this.options = this.setOptions(options);
        }

        NodeLightStorage.ensureDirectory(this.options.dir);
    }

    /**
     * Purges the Storage.
     * @returns {Promise<void>}
     */
    public clear(): void {
        const data = this.data();
        for (const d of data) {
            this.removeItem(d.key);
        }
    }

    /**
     * Gets the item.
     * @param {string} key
     * @returns {Promise<Entry["value"]>}
     * @private
     */
    public getItem(key: string): Entry['value'] | null {
        return this.getFileEntrySync(key);
    }

    /**
     * Sets the item.
     * @param {string} key
     * @param {Entry["value"]} entryValue
     * @returns {Promise<CreatedEntryResult>}
     * @private
     */
    public setItem(key: string, entryValue: Entry['value']): void {
        this.writeFileSync(key, entryValue);
    }

    /**
     * Returns the key of an entry by a given index.
     * @returns {Entry["key"][]}
     */
    public key(index: number): Entry['key'] | null {
        const data = this.data();
        if (data[index] === undefined) {
            return null;
        }

        return data[index].key;
    }

    /**
     * Returns the number of items in the Storage.
     * @returns {Promise<number>}
     */
    public get length(): number {
        const data = this.data();
        return data.length;
    }

    /**
     * Remove entry by key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    public removeItem(key: string): void {
        this.deleteFileSync(this.getEntryPath(key));
    }

    /**
     * Sets options.
     * @param {KeyValueStorageOptions} userOptions
     * @returns {KeyValueStorageOptions}
     */
    private setOptions(userOptions: KeyValueStorageOptions): KeyValueStorageOptions {
        const options: KeyValueStorageOptions = clone(this.options);
        if (userOptions.dir) {
            options.dir = NodeLightStorage.resolveDir(userOptions.dir);
        }

        return options;
    }

    /**
     * Returns the storage data.
     * @returns {Promise<Entry[]>}
     * @private
     */
    private data(): Entry[] {
        return this.readDirectorySync(this.options.dir);
    }

    /**
     * Retrieves the content of the entry. It returns null if the file could not be found.
     * @param {string} key
     * @returns {Promise<Entry>}
     * @private
     */
    private getFileEntrySync(key: string): Entry['value'] | null {
        try {
            return this.readFileSync(this.getEntryPath(key)).value;
        } catch (e) {
            if (e.code === 'ENOENT') {
                return null;
            }
            MessageBus.send('error', `NodeStorage - could not get entry due to ${e.toString()}`);
            throw new Error(e);
        }
    }

    /**
     * Returns the full path of the file by the given key.
     * @param {string} key
     * @returns {Promise<string>}
     * @private
     */
    private getEntryPath(key: string): string {
        return path.join(this.options.dir, NodeLightStorage.md5(key));
    }

    /**
     * Writes the file.
     * @param {string} key
     * @param {Entry["value"]} value
     * @returns {Promise<{file: string, content: Entry["value"]}>}
     * @private
     */
    private writeFileSync(key: string, value: Entry['value']): CreatedEntryResult {
        const fileName = this.getEntryPath(key);
        try {
            fs.writeFileSync(fileName, stringify({key, value: value}), 'utf8');
            return {file: fileName, value: value};
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not write file ${fileName} due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     * Reads the content of a file by the given path.
     * @param {string} path
     * @param {{}} options
     * @returns {Promise<*>}
     * @private
     */
    private readFileSync(path: string, options = {}): Entry {
        try {
            const text = fs.readFileSync(path, 'utf8');
            return JSON.parse(text);
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not read file ${path} due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     * Deletes the file by the given path.
     * @param {string} path
     * @returns {Promise<void>}
     * @private
     */
    private deleteFileSync(path: string): RemovedEntryResult {
        try {
            fs.accessSync(path);
            fs.unlinkSync(path);
            return {file: path, removed: true};
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not delete file ${path} due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     * Reads the content of the given directory.
     * @param {string} dir
     * @returns {Promise<*[]>}
     * @private
     */
    private readDirectorySync(dir: string): Entry[] {
        try {
            fs.accessSync(dir);
            const files = fs.readdirSync(dir).sort(function (fileA, fileB) {
                return (
                    fs.statSync(dir + path.sep + fileA).mtime.getTime() -
                    fs.statSync(dir + path.sep + fileB).mtime.getTime()
                );
            });
            const data: Entry[] = [];
            try {
                for (const currentFile of files) {
                    if (currentFile[0] !== '.') {
                        data.push(this.readFileSync(path.join(this.options.dir, currentFile)));
                    }
                }
                return data;
            } catch (err) {
                throw err;
            }
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not read directory due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     * Ensures the directory exists, otherwise it will create it.
     * @param {string} dir
     * @returns {Promise<*>}
     * @private
     */
    private static ensureDirectory(dir: string): {dir: string} {
        const result = {dir: dir};

        try {
            fs.accessSync(dir);
        } catch (accessErr) {
            MessageBus.send(
                'debug',
                'NodeStorage - could not find storage directory, creating a' + ' new one.'
            );
            try {
                fs.mkdirSync(dir, {recursive: true});
            } catch (mkdirErr) {
                MessageBus.send(
                    'Error',
                    `NodeStorage - could not create storage directory due to ${mkdirErr.toString()}`
                );
                throw mkdirErr;
            }
        }

        return result;
    }

    /**
     * Creates hash based on the given key.
     * @param {string} key
     * @returns {string}
     * @private
     */
    private static md5(key: string): string {
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * Resolves the given directory path.
     * @param {string} dir
     * @returns {string}
     * @private
     */
    private static resolveDir(dir: string): string {
        dir = path.normalize(dir);
        if (path.isAbsolute(dir)) {
            return dir;
        }
        return path.join(process.cwd(), dir);
    }
}
