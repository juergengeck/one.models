import EventEmitter from 'events';
import {getObjectByIdObj, onVersionedObj} from 'one.core/lib/storage-versioned-objects';
import {Settings as OneSettings, VersionedObjectResult} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan} from 'one.core/lib/plan';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {serializeWithType} from 'one.core/lib/util/promise';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {createEvent} from '../misc/OEvent';

// -------- LOW LEVEL API -----------

export type Settings = {
    id: string; // id value
    properties: Map<string, string>;
};

export abstract class PropertyTree extends EventEmitter {
    proxyInstances: Map<string, PropertyTreeProxy> = new Map<string, PropertyTreeProxy>();
    public onSettingChange = createEvent<(key: string, value: string | undefined) => void>();

    abstract setValue(key: string, value: string): Promise<void>;
    abstract getValue(key: string): string;
    abstract getChild(key: string): PropertyTree;
    abstract hasValue(key: string): boolean;
    abstract async init(): Promise<void>;
}

export class PropertyTreeProxy extends PropertyTree {
    prefix: string;
    separator: string;
    parent: PropertyTree;

    async init(): Promise<void> {}

    constructor(prefix: string, separator: string, parent: PropertyTree) {
        super();
        this.prefix = prefix;
        this.separator = separator;
        this.parent = parent;

        this.parent.onSettingChange((key, value) => {
            // strip prefix from key
            const keys = key.split(separator);
            const strippedKey = keys[keys.length - 1];
            this.onSettingChange.emit(strippedKey, value);
        });
    }

    async setValue(key: string, value: string): Promise<void> {
        await this.parent.setValue(this.prefix + this.separator + key, value);
    }

    getValue(key: string): string {
        return this.parent.getValue(this.prefix + this.separator + key);
    }

    getChild(key: string): PropertyTree {
        let proxyInstance = this.proxyInstances.get(key);

        if (proxyInstance === undefined) {
            proxyInstance = new PropertyTreeProxy(key, this.separator, this);
            this.proxyInstances.set(key, proxyInstance);
        }

        return proxyInstance;
    }

    hasValue(key: string): boolean {
        return this.parent.getValue(this.prefix + this.separator + key) !== '';
    }
}

export default class PropertyTreeStore extends PropertyTree {
    oneId: string;
    separator: string;
    keyValueStore: Map<string, string> = new Map<string, string>();

    async init(): Promise<void> {
        try {
            const oneKeyValueStore = await getObjectByIdObj({
                $type$: 'Settings',
                id: this.oneId
            });
            this.storageUpdated(oneKeyValueStore.obj);
        } catch (e) {
            this.keyValueStore = new Map<string, string>();
        }
    }

    constructor(oneId: string, separator = '.') {
        super();
        this.oneId = oneId;
        this.separator = separator;
        // register storageUpdated hook at one storage
        onVersionedObj.addListener((caughtObject: VersionedObjectResult) => {
            if (this.isSettingsVersionedObjectResult(caughtObject)) {
                this.storageUpdated(caughtObject.obj);
            }
        });
    }

    private isSettingsVersionedObjectResult(
        caughtObject: VersionedObjectResult
    ): caughtObject is VersionedObjectResult<OneSettings> {
        return (caughtObject as VersionedObjectResult<OneSettings>).obj.$type$ === 'Settings';
    }

    // one hook for changed settings object
    storageUpdated(oneSettings: OneSettings): void {
        // or: if map was empty then emit only a single event with empty key
        if (this.keyValueStore.size === 0) {
            this.keyValueStore = new Map<string, string>(oneSettings.properties);
            this.emit('update', '');
            this.onSettingChange.emit('', undefined);
        } else {
            // diff the oneSettings with the keyValueStore
            for (const [key, value] of oneSettings.properties.entries()) {
                if (value !== this.keyValueStore.get(key)) {
                    // update the keyValueStore with changes
                    this.keyValueStore.set(key, value);
                    // emit only the remembered changes
                    this.emit('update', key, value);
                    this.onSettingChange.emit(key, value);
                }
            }
        }
    }

    async setValue(key: string, value: string): Promise<void> {
        // --- option 1: --- // Lets this try first!
        // copy keyValueStore
        const idHashOfKeyValueStore = await calculateIdHashOfObj({
            $type$: 'Settings',
            id: this.oneId
        });

        await serializeWithType(idHashOfKeyValueStore, async () => {
            const keyValueStoreCopy: Map<string, string> = new Map<string, string>(
                this.keyValueStore
            );
            // change the value
            keyValueStoreCopy.set(key, value);
            // store the object in instance
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'Settings',
                    id: this.oneId,
                    properties: keyValueStoreCopy
                }
            );
        });
    }

    getValue(key: string): string {
        const value = this.keyValueStore.get(key);

        if (value !== undefined) {
            return value;
        }

        return '';
    }

    getChild(key: string): PropertyTree {
        let proxyInstance = this.proxyInstances.get(key);

        if (proxyInstance === undefined) {
            proxyInstance = new PropertyTreeProxy(key, this.separator, this);
            this.proxyInstances.set(key, proxyInstance);
        }

        return proxyInstance;
    }

    hasValue(key: string): boolean {
        return this.keyValueStore.get(key) !== '';
    }
}
