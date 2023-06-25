import type {VersionedObjectResult} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    getIdObject,
    onIdObj,
    onVersionedObj
} from '@refinio/one.core/lib/storage-versioned-objects';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage-unversioned-objects';
import {onUnversionedObj} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {
    OneIdObjectTypes,
    OneUnversionedObjectTypeNames,
    OneVersionedObjectTypeNames
} from '@refinio/one.core/lib/recipes';
import {getOrCreate} from '../utils/MapUtils';
import {OEvent} from './OEvent';
import type {
    OneUnversionedObjectInterfaces,
    OneVersionedObjectInterfaces
} from '@OneObjectInterfaces';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {FileCreationStatus} from '@refinio/one.core/lib/storage-base-common';
import BlockingQueue from './BlockingQueue';

export interface IdObjectResult<T extends OneIdObjectTypes = OneIdObjectTypes> {
    readonly obj: T;
    hash?: void;
    idHash: SHA256IdHash<OneVersionedObjectInterfaces[T['$type$']]>;
    status: FileCreationStatus;
    timestamp?: void;
}

function isVersionedResult(
    result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
): result is VersionedObjectResult {
    if (!Object.hasOwn(result, 'idHash')) {
        return false;
    }

    return Object.hasOwn(result, 'timestamp');
}

function isUnversionedResult(
    result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
): result is UnversionedObjectResult {
    return Object.hasOwn(result, 'hash');
}

type OneVersionedObjectTypeNamesOrStar<T extends OneVersionedObjectTypeNames | '*'> =
    T extends OneVersionedObjectTypeNames ? T : OneVersionedObjectTypeNames;

type OneUnversionedObjectTypeNamesOrStar<T extends OneUnversionedObjectTypeNames | '*'> =
    T extends OneUnversionedObjectTypeNames ? T : OneUnversionedObjectTypeNames;

type HandlerInfo<T> = {
    cb: (result: T) => Promise<void> | void;
    description: string;
    callStack?: string;
};

export default class ObjectEventDispatcher {
    private newVersionHandler = new Map<
        string, // This is OneVersionedObjectTypeNames | '*' | <type>+Hash
        Array<HandlerInfo<VersionedObjectResult>>
    >();
    private newUnversionedObjectHandler = new Map<
        OneUnversionedObjectTypeNames | '*',
        Array<HandlerInfo<UnversionedObjectResult>>
    >();
    private newIdHandler = new Map<
        OneVersionedObjectTypeNames | '*',
        Array<HandlerInfo<IdObjectResult>>
    >();

    onError = new OEvent<(err: any) => void>();

    private buffer = new BlockingQueue<
        VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    >(Number.POSITIVE_INFINITY, 1);

    private stopped = true;
    private waitForEventLoopDonePromise: Promise<void> | null = null;
    private disconnect: () => void = () => {};

    // #### init / shutdown ####

    dump() {
        console.log(this.buffer.length, this.buffer.pendingPromiseCount);
        console.log(JSON.stringify([...this.newVersionHandler.entries()], null, 4));
        console.log(JSON.stringify([...this.newUnversionedObjectHandler.entries()], null, 4));
        console.log(JSON.stringify([...this.newIdHandler.entries()], null, 4));
    }

    async init() {
        // TODO: load buffer from disk

        const d1 = onVersionedObj.addListener(this.appendToBuffer.bind(this));
        const d2 = onUnversionedObj.addListener(this.appendToBuffer.bind(this));
        const d3 = onIdObj.addListener(result => {
            // This complicated stuff should go away after we added the OneIdObjectResult to one.core
            getIdObject(result.idHash)
                .then(obj => {
                    const idObjResult: IdObjectResult = {
                        obj,
                        idHash: result.idHash as SHA256IdHash,
                        status: result.status
                    };
                    this.appendToBuffer(idObjResult);
                })
                .catch(this.onError.emit.bind(this.onError));
        });

        this.disconnect = () => {
            d1();
            d2();
            d3();
        };

        this.startDispatchLoop().catch(this.onError.emit.bind(this.onError));
    }

    async shutdown() {
        this.disconnect();
        this.disconnect = () => {
            // Intentionally empty
        };
        this.stopped = true;
        this.buffer.cancelPendingPromises();
        if (this.waitForEventLoopDonePromise) {
            await this.waitForEventLoopDonePromise;
        }
    }

    onNewVersion<T extends OneVersionedObjectTypeNames | '*'>(
        cb: (
            result: VersionedObjectResult<
                OneVersionedObjectInterfaces[OneVersionedObjectTypeNamesOrStar<T>]
            >
        ) => Promise<void> | void,
        description: string,
        type: T | '*' = '*',
        idHash:
            | SHA256IdHash<OneVersionedObjectInterfaces[OneVersionedObjectTypeNamesOrStar<T>]>
            | '*' = '*'
    ): () => void {
        const entry = getOrCreate(
            this.newVersionHandler,
            idHash === '*' ? type : `${type}+${idHash}`,
            []
        );

        entry.push({
            cb: cb as (result: VersionedObjectResult) => Promise<void> | void,
            description,
            callStack: new Error('').stack
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            entry.splice(i, 1);
        };
    }

    onUnversionedObject<T extends OneUnversionedObjectTypeNames | '*'>(
        cb: (
            result: UnversionedObjectResult<
                OneUnversionedObjectInterfaces[OneUnversionedObjectTypeNamesOrStar<T>]
            >
        ) => Promise<void> | void,
        description: string,
        type: T | '*' = '*'
    ): () => void {
        const entry = getOrCreate(this.newUnversionedObjectHandler, type, []);

        entry.push({
            cb: cb as (result: UnversionedObjectResult) => Promise<void> | void,
            description,
            callStack: new Error('').stack
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            entry.splice(i, 1);
        };
    }

    onNewIdObject<T extends OneVersionedObjectTypeNames | '*'>(
        cb: (
            result: IdObjectResult<
                OneVersionedObjectInterfaces[OneVersionedObjectTypeNamesOrStar<T>]
            >
        ) => Promise<void> | void,
        description: string,
        type: T | '*' = '*'
    ): () => void {
        const entry = getOrCreate(this.newIdHandler, type, []);

        entry.push({
            cb: cb as (result: IdObjectResult) => Promise<void> | void,
            description,
            callStack: new Error('').stack
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            entry.splice(i, 1);
        };
    }

    // #### Private stuff ####

    private appendToBuffer(
        result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    ) {
        this.buffer.add(result);
        // TODO: write to disk
    }

    private async markAsDone(
        result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    ) {
        // TODO: remove it from disk
    }

    private async dispatchHandler<T>(result: T, handler: HandlerInfo<T>[]): Promise<void> {
        for (const h of handler) {
            try {
                await h.cb(result);
            } catch (e) {
                this.onError.emit(e);
            }
        }
    }

    private async startDispatchLoop() {
        // eslint-disable-next-line func-style
        let resolvePromise: (value: void | PromiseLike<void>) => void = () => {
            // noop
        };

        this.waitForEventLoopDonePromise = new Promise(resolve => {
            resolvePromise = resolve;
        });

        this.stopped = false;
        for (;;) {
            let result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult;

            try {
                result = await this.buffer.remove();
            } catch (e) {
                resolvePromise();
                break;
            }

            if (isVersionedResult(result)) {
                const handler = [
                    ...(this.newVersionHandler.get(result.obj.$type$) || []),
                    ...(this.newVersionHandler.get(`${result.obj.$type$}+${result.idHash}`) || []),
                    ...(this.newVersionHandler.get('*') || [])
                ];

                await this.dispatchHandler(result, handler);
            } else if (isUnversionedResult(result)) {
                const handler = [
                    ...(this.newUnversionedObjectHandler.get(result.obj.$type$) || []),
                    ...(this.newUnversionedObjectHandler.get('*') || [])
                ];

                await this.dispatchHandler(result, handler);
            } else {
                const handler = [
                    ...(this.newIdHandler.get(result.obj.$type$) || []),
                    ...(this.newIdHandler.get('*') || [])
                ];

                await this.dispatchHandler(result, handler);
            }

            await this.markAsDone(result);

            if (this.stopped) {
                resolvePromise();
                break;
            }
        }
    }
}

// Temporary global, until we adjusted the architecture

export const objectEvents = new ObjectEventDispatcher();
