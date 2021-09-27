import {clone} from 'one.core/lib/util/clone-object';
import ErrnoException = NodeJS.ErrnoException;
import {stringify} from 'one.core/lib/util/sorted-stringify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const pkg = require('../package.json');

type KeyValueStorageOptions = {
    dir: string;
};

type Entry = {
    key: string;
    value: unknown;
};

type CreatedEntryResult = {file: string; content: Entry['value']};
type RemovedEntryResult = {file: string; removed: boolean; existed: ErrnoException | null};

/**
 * Key Value Storage for NodeJS
 */
export default class KeyValueStorage {
    private static instance: KeyValueStorage;
    private options: KeyValueStorageOptions = {
        dir: '.' + pkg.name + '/storage',
    };

    /**
     *
     * @param {KeyValueStorageOptions} options
     * @returns {KeyValueStorage}
     */
    constructor(options?: KeyValueStorageOptions) {
        if (!KeyValueStorage.instance) {
            KeyValueStorage.instance = new KeyValueStorage(options);
        }

        return KeyValueStorage.instance;
    }

    /**
     *
     * @param {KeyValueStorageOptions} options
     * @returns {Promise<KeyValueStorageOptions>}
     */
    async init(options: KeyValueStorageOptions): Promise<KeyValueStorageOptions> {
        if (options) {
            this.options = this.setOptions(options);
        }
        await this.ensureDirectory(this.options.dir);

        return this.options;
    }

    /**
     *
     * @param {KeyValueStorageOptions} userOptions
     * @returns {KeyValueStorageOptions}
     */
    setOptions(userOptions: KeyValueStorageOptions): KeyValueStorageOptions {
        let options: KeyValueStorageOptions = clone(this.options);
        if (userOptions.dir) {
            options.dir = KeyValueStorage.resolveDir(userOptions.dir);
        }

        return options;
    }

    /**
     *
     * @returns {Promise<Entry["key"][]>}
     */
    public async keys(): Promise<Entry['key'][]> {
        let data = await this.data();
        return data.map(entry => entry.key);
    }

    /**
     *
     * @returns {Promise<Entry["value"][]>}
     */
    public async values(): Promise<Entry['value'][]> {
        let data = await this.data();
        return data.map(entry => entry.value);
    }

    /**
     *
     * @returns {Promise<number>}
     */
    public async length(): Promise<number> {
        let data = await this.data();
        return data.length;
    }

    /**
     *
     * @param {(entry: Entry) => Promise<unknown>} callback
     * @returns {Promise<void>}
     */
    public async forEach(callback: (entry: Entry) => Promise<unknown>): Promise<void> {
        let data = await this.data();
        for (let d of data) {
            await callback(d);
        }
    }

    /**
     *
     * @returns {Promise<void>}
     */
    public async clear(): Promise<void> {
        let data = await this.data();
        for (let d of data) {
            await this.removeItem(d.key);
        }
    }

    /**
     *
     * @param {string} key
     * @returns {Promise<RemovedEntryResult>}
     */
    public async removeItem(key: string): Promise<RemovedEntryResult> {
        return await this.deleteFile(this.getEntryPath(key));
    }

    /**
     *
     * @param {string} key
     * @param {Entry["value"]} value
     * @returns {Promise<CreatedEntryResult>}
     */
    public async set(key: string, value: Entry['value']): Promise<CreatedEntryResult> {
        return await this.setItem(key, value);
    }

    /**
     *
     * @param {string} key
     * @param {Entry["value"]} value
     * @returns {Promise<CreatedEntryResult>}
     */
    public async update(key: string, value: Entry['value']): Promise<CreatedEntryResult> {
        return await this.updateItem(key, value);
    }

    /**
     *
     * @param {string} key
     * @returns {Promise<Entry["value"]>}
     */
    async get(key: string): Promise<Entry['value']> {
        return await this.getItem(key);
    }

    /**
     *
     * @returns {Promise<Entry[]>}
     * @private
     */
    private async data(): Promise<Entry[]> {
        return (await this.readDirectory(this.options.dir)) as Entry[];
    }

    /**
     *
     * @param {string} key
     * @returns {Promise<Entry["value"]>}
     * @private
     */
    private async getItem(key: string): Promise<Entry['value']> {
        let entry = await this.getEntry(key);
        return entry.value;
    }

    /**
     *
     * @param {string} key
     * @param {Entry["value"]} entryValue
     * @returns {Promise<CreatedEntryResult>}
     * @private
     */
    private async setItem(key: string, entryValue: Entry['value']): Promise<CreatedEntryResult> {
        let value = KeyValueStorage.copy(entryValue);
        let entry = {key: key, value: value};
        return this.writeFile(this.getEntryPath(key), entry);
    }

    /**
     *
     * @param {string} key
     * @returns {Promise<Entry>}
     * @private
     */
    private async getEntry(key: string): Promise<Entry> {
        return (await this.readFile(this.getEntryPath(key))) as Entry;
    }

    /**
     *
     * @param {string} key
     * @returns {Promise<string>}
     * @private
     */
    private getEntryPath(key: string) {
        return path.join(this.options.dir, KeyValueStorage.md5(key));
    }

    /**
     *
     * @param {string} key
     * @param {Entry["value"]} entryValue
     * @returns {Promise<{file: string, content: Entry["value"]}>}
     * @private
     */
    private async updateItem(key: string, entryValue: Entry['value']): Promise<CreatedEntryResult> {
        let previousentry = await this.getEntry(key);
        if (previousentry) {
            let newentryValue = KeyValueStorage.copy(entryValue);
            let entry = {key: key, value: newentryValue};
            return this.writeFile(this.getEntryPath(key), entry);
        } else {
            return this.setItem(key, entryValue);
        }
    }

    /**
     *
     * @param {string} dir
     * @returns {Promise<*>}
     * @private
     */
    private async ensureDirectory(dir: string) {
        return new Promise((resolve, reject) => {
            let result = {dir: dir};
            //check to see if dir is present
            fs.access(dir, (exists: ErrnoException | null) => {
                if (exists) {
                    return resolve(result);
                } else {
                    //create the directory
                    fs.mkdir(dir, {recursive: true}, (err: ErrnoException | null) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(result);
                    });
                }
            });
        });
    }

    /**
     *
     * @param {string} dir
     * @returns {Promise<*[]>}
     * @private
     */
    private async readDirectory(dir: string): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            //check to see if dir is present
            fs.access(dir, (exists: ErrnoException | null) => {
                if (exists) {
                    //load data
                    fs.readdir(dir, async (err: ErrnoException | null, arr: string[]) => {
                        if (err) {
                            return reject(err);
                        }
                        let data = [];
                        try {
                            for (let currentFile of arr) {
                                if (currentFile[0] !== '.') {
                                    data.push(
                                        await this.readFile(
                                            path.join(this.options.dir, currentFile)
                                        )
                                    );
                                }
                            }
                        } catch (err) {
                            reject(err);
                        }
                        resolve(data);
                    });
                } else {
                    reject(new Error(`[KeyValueStorage][readDirectory] ${dir} does not exists!`));
                }
            });
        });
    }

    /**
     *
     * @param {string} file
     * @param {{}} options
     * @returns {Promise<*>}
     * @private
     */
    private async readFile(file: string, options = {}): Promise<unknown> {
        return new Promise((resolve, reject) => {
            fs.readFile(file, 'utf8', (err: ErrnoException | null, text: string) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        resolve({});
                    } else {
                        return reject(err);
                    }
                }
                const input = JSON.parse(text);
                if (!KeyValueStorage.isValidStorageFileContent(input)) {
                    return reject(
                        new Error(
                            `[KeyValueStorage][readFile] ${file} is not a valid storage file!`
                        )
                    );
                }
                resolve(input);
            });
        });
    }

    /**
     *
     * @param {string} file
     * @param {Entry["value"]} content
     * @returns {Promise<{file: string, content: Entry["value"]}>}
     * @private
     */
    private async writeFile(file: string, content: Entry['value']): Promise<CreatedEntryResult> {
        return new Promise((resolve, reject) => {
            fs.writeFile(file, stringify(content), 'utf8', err => {
                if (err) {
                    return reject(err);
                }
                resolve({file: file, content: content});
            });
        });
    }

    /**
     *
     * @param {string} file
     * @returns {Promise<void>}
     * @private
     */
    private async deleteFile(file: string): Promise<RemovedEntryResult> {
        return new Promise((resolve, reject) => {
            fs.access(file, (exists: ErrnoException | null) => {
                if (exists) {
                    fs.unlink(file, (err: ErrnoException | null) => {
                        /* Only throw the error if the error is something else */
                        if (err && err.code !== 'ENOENT') {
                            return reject(err);
                        }
                        let result = {file: file, removed: !err, existed: exists};
                        resolve(result);
                    });
                } else {
                    let result = {file: file, removed: false, existed: exists};
                    resolve(result);
                }
            });
        });
    }

    /**
     *
     * @param value
     * @returns {Promise<*>}
     * @private
     */
    private static async copy(value: unknown): Promise<unknown> {
        // literals are passed by value
        if (typeof value !== 'object') {
            return value;
        }
        return JSON.parse(stringify(value));
    }

    /**
     *
     * @param {string} key
     * @returns {string}
     * @private
     */
    private static md5(key: string): string {
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     *
     * @param content
     * @returns {boolean}
     * @private
     */
    private static isValidStorageFileContent(content: any): boolean {
        return content && content.key;
    }

    /**
     *
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
