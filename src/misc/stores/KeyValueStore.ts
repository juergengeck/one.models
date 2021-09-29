import {clone} from 'one.core/lib/util/clone-object';
import {stringify} from 'one.core/lib/util/sorted-stringify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {createMessageBus} from 'one.core/lib/message-bus';
const MessageBus = createMessageBus('NodeStorage');

type KeyValueStoreOptions = {
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
export class KeyValueStore implements Storage {
    private readonly options: KeyValueStoreOptions = {
        dir: './storage'
    };

    /**
     *
     * @param {KeyValueStoreOptions} options
     * @returns {KeyValueStore}
     */
    constructor(options?: KeyValueStoreOptions) {
        if (options !== undefined) {
            this.setOptions(options);
        }

        this.ensureDirectory(this.options.dir);
    }

    /**
     * Purges the Storage.
     * @returns {Promise<void>}
     */
    public clear(): void {
        this.deleteEntries();
    }

    /**
     * Gets the item.
     * @param {string} key
     * @returns {Promise<Entry["value"]>}
     * @private
     */
    public getItem(key: string): Entry['value'] | null {
        return this.retrieveEntry(key);
    }

    /**
     * Sets the item.
     * @param {string} key
     * @param {Entry["value"]} entryValue
     * @returns {Promise<CreatedEntryResult>}
     * @private
     */
    public setItem(key: string, entryValue: Entry['value']): void {
        this.persistEntry(key, entryValue);
    }

    /**
     * Returns the key of an entry by a given index.
     * @returns {Entry["key"][]}
     */
    public key(index: number): Entry['key'] | null {
        if (this.store[index] === undefined) {
            return null;
        }

        return this.store[index].key;
    }

    /**
     * Returns the number of items in the Storage.
     * @returns {Promise<number>}
     */
    public get length(): number {
        return this.store.length;
    }

    /**
     * Remove entry by key.
     * @param {string} key
     * @returns {Promise<void>}
     */
    public removeItem(key: string): void {
        this.deleteEntry(key);
    }

    /**
     * Sets options.
     * @param {KeyValueStoreOptions} userOptions
     * @returns {KeyValueStoreOptions}
     */
    private setOptions(userOptions: KeyValueStoreOptions): KeyValueStore {
        if (userOptions.dir) {
            this.options.dir = KeyValueStore.resolveDir(userOptions.dir);
        }

        return this;
    }

    /**
     * Reads the content of a file by the given path.
     * @returns {Promise<*>}
     * @private
     */
    private get store(): Entry[] {
        try {
            const text = fs.readFileSync(this.storeFilePath, 'utf8');
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
     * Returns the full path of the file by the given key.
     * @returns {Promise<string>}
     * @private
     */
    private get storeFilePath(): string {
        return path.join(this.options.dir, 'store');
    }

    /**
     * Retrieves the content of the entry. It returns null if the file could not be found.
     * @param {string} key
     * @returns {Promise<Entry>}
     * @private
     */
    private retrieveEntry(key: string): Entry['value'] | null {
        try {
            const entries = this.store;
            const foundEntry = entries.find(entry => entry.key === key);
            if (foundEntry === undefined) {
                return null;
            }
            return foundEntry.value;
        } catch (e) {
            MessageBus.send('error', `NodeStorage - could not get entry due to ${e.toString()}`);
            throw new Error(e);
        }
    }

    /**
     * Writes the file.
     * @param {string} key
     * @param {Entry["value"]} value
     * @returns {Promise<{file: string, content: Entry["value"]}>}
     * @private
     */
    private persistEntry(key: string, value: Entry['value']): CreatedEntryResult {
        try {
            const entries = this.store;
            const foundEntry = entries.find(entry => entry.key === key);
            if (foundEntry !== undefined) {
                foundEntry.value = value;
            } else {
                entries.push({key, value});
            }
            fs.writeFileSync(this.storeFilePath, stringify(entries), 'utf8');
            return {file: this.storeFilePath, value: value};
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not write file ${this.storeFilePath} due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     * Deletes the file by the given path.
     * @returns {Promise<void>}
     * @private
     * @param key
     */
    private deleteEntry(key: string): RemovedEntryResult {
        try {
            const entries = this.store;
            const foundEntryIdx = entries.findIndex((entry: Entry) => entry.key === key);
            if (foundEntryIdx) {
                entries.splice(foundEntryIdx, 1);
                fs.writeFileSync(this.storeFilePath, stringify(entries), 'utf8');
                return {file: this.storeFilePath, removed: true};
            }
            return {file: this.storeFilePath, removed: false};
        } catch (err) {
            MessageBus.send(
                'error',
                `NodeStorage - could not delete file ${path} due to ${err.toString()}`
            );
            throw err;
        }
    }

    /**
     *
     * @private
     */
    private deleteEntries(): void {
        try {
            fs.writeFileSync(this.storeFilePath, stringify([]), 'utf8');
        } catch (e) {
            MessageBus.send(
                'error',
                `NodeStorage - could not clear storage due to ${e.toString()}`
            );
            throw new Error(e.toString());
        }
    }

    /**
     * Ensures the directory exists, otherwise it will create it.
     * @param {string} dir
     * @returns {Promise<*>}
     * @private
     */
    private ensureDirectory(dir: string): {dir: string} {
        const result = {dir: dir};

        try {
            fs.accessSync(this.storeFilePath);
        } catch (accessErr) {
            MessageBus.send(
                'debug',
                'NodeStorage - could not find storage directory, creating a' + ' new one.'
            );
            try {
                fs.mkdirSync(dir, {recursive: true});
                fs.writeFileSync(this.storeFilePath, JSON.stringify([]));
                console.log('created');
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
