import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {ensureVersionedObjectTypeName} from '@refinio/one.core/lib/object-recipes';
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
    OneUnversionedObjectTypes,
    OneVersionedObjectTypeNames,
    OneVersionedObjectTypes
} from '@refinio/one.core/lib/recipes';
import {ensureHash, ensureIdHash} from '@refinio/one.core/lib/util/type-checks';
import {getOrCreate} from '../utils/MapUtils';
import {OEvent} from './OEvent';
import type {
    OneUnversionedObjectInterfaces,
    OneVersionedObjectInterfaces
} from '@OneObjectInterfaces';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {FileCreationStatus} from '@refinio/one.core/lib/storage-base-common';
import BlockingQueue from './BlockingQueue';

const MessageBus = createMessageBus('ObjectEventDispatcher');

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

/**
 * Translates '*' to OneVersionedObjectTypeNames
 */
type OneVersionedObjectTypeNamesOrStar<T extends OneVersionedObjectTypeNames | '*'> =
    T extends OneVersionedObjectTypeNames ? T : OneVersionedObjectTypeNames;

/**
 * Translates '*' to OneUnersionedObjectTypeNames
 */
type OneUnversionedObjectTypeNamesOrStar<T extends OneUnversionedObjectTypeNames | '*'> =
    T extends OneUnversionedObjectTypeNames ? T : OneUnversionedObjectTypeNames;

type VersionedFilterType =
    | {
          filterType: OneVersionedObjectTypeNames;
          filterIdHash: SHA256IdHash | '*';
      }
    | {
          filterType: '*';
          filterIdHash: '*';
      };

export type PublicVersionedHandlerInfo = HandlerInfo<VersionedObjectResult> & {
    type: 'onNewVersion';
} & VersionedFilterType;

export type PublicUnversionedHandlerInfo = HandlerInfo<UnversionedObjectResult> & {
    type: 'onUnversionedObject';
    filterType: OneUnversionedObjectTypeNames | '*';
};

export type PublicIdHandlerInfo = HandlerInfo<IdObjectResult> & {
    type: 'onIdObject';
    filterType: OneVersionedObjectTypeNames | '*';
};

export type PublicHandlerInfo =
    | PublicVersionedHandlerInfo
    | PublicUnversionedHandlerInfo
    | PublicIdHandlerInfo;

export type HandlerInfo<T> = {
    cb: (result: T) => Promise<void> | void;
    description: string;
    callStack?: string;

    // Statistics
    registerTime: number;
    deregisterTime?: number;
    executionStatistics: {
        startTime: number;
        endTime?: number;
        hash?: SHA256Hash;
        idHash?: SHA256IdHash;
        error?: any;
    }[];
};

export default class ObjectEventDispatcher {
    onError = new OEvent<(err: any) => void>();
    onGlobalStatisticChanged = new OEvent<() => void>();
    onPauseStateChanged = new OEvent<(paused: boolean) => void>();

    /**
     * This option discards objects for which nobody listens before they are pushed to the buffer.
     *
     * This might have the drawback that if an object in the buffer causes a new event listener
     * to be registered, the new event listener will miss such objects. This might not be a
     * problem at the moment, because such objects will already be on disk (That's why it is
     * enabled by default).
     */
    public enableEnqueueFiltering = true;

    public enableStatistics = true;
    public maxStatisticsPerCallback = -1;
    public cacheOldCallbacks = false;

    // ######## private properties ########

    /**
     * Buffer that buffers all one.core events.
     * @private
     */
    private buffer = new BlockingQueue<
        VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    >(Number.POSITIVE_INFINITY, 1);

    // #### event handler ####

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

    // #### Members for stopping / pausing the event loop ####
    private stopped = true;
    private waitForEventLoopDonePromise: Promise<void> | null = null;
    private disconnect: () => void = () => {
        // Intentional
    };

    private pausePromise: Promise<void> | undefined;
    private pauseResume: (() => void) | undefined;

    // Statistics of old / disconnected handlers
    private oldVersionHandler = new Map<
        string, // This is OneVersionedObjectTypeNames | '*' | <type>+Hash
        Array<HandlerInfo<VersionedObjectResult>>
    >();
    private oldUnversionedObjectHandler = new Map<
        OneUnversionedObjectTypeNames | '*',
        Array<HandlerInfo<UnversionedObjectResult>>
    >();
    private oldIdHandler = new Map<
        OneVersionedObjectTypeNames | '*',
        Array<HandlerInfo<IdObjectResult>>
    >();
    private totalExecutionCount = 0;

    // ######## init / shutdown ########

    async init() {
        // TODO: load buffer from disk

        const d1 = onVersionedObj.addListener(this.appendToBufferIfNew.bind(this));
        const d2 = onUnversionedObj.addListener(this.appendToBufferIfNew.bind(this));
        const d3 = onIdObj.addListener(result => {
            // This complicated stuff should go away after we added the OneIdObjectResult to one.core
            getIdObject(result.idHash)
                .then(obj => {
                    const idObjResult: IdObjectResult = {
                        obj,
                        idHash: result.idHash as SHA256IdHash,
                        status: result.status
                    };
                    this.appendToBufferIfNew(idObjResult);
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
        this.resume();
        this.buffer.cancelPendingPromises();
        if (this.waitForEventLoopDonePromise) {
            await this.waitForEventLoopDonePromise;
        }
    }

    // ######## start / pause event handling ########

    pause(): void {
        if (this.pausePromise) {
            throw new Error('Already paused');
        }

        this.pausePromise = new Promise(resolve => {
            this.pauseResume = resolve;
            this.onPauseStateChanged.emit(true);
        });
    }

    resume(): void {
        if (this.pauseResume) {
            this.pausePromise = undefined;
            this.onPauseStateChanged.emit(false);
            this.pauseResume();
        }
    }

    isPaused(): boolean {
        return this.pausePromise !== undefined;
    }

    // ######## Event handler registration ########

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
            callStack: new Error('').stack,
            registerTime: Date.now(),
            executionStatistics: []
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            const oldHandlers = entry.splice(i, 1);

            if (this.cacheOldCallbacks) {
                const oldEntry = getOrCreate(this.newVersionHandler, type, []);
                oldEntry.push(...oldHandlers);
            }
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
            callStack: new Error('').stack,
            registerTime: Date.now(),
            executionStatistics: []
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            const oldHandlers = entry.splice(i, 1);

            if (this.cacheOldCallbacks) {
                const oldEntry = getOrCreate(this.newUnversionedObjectHandler, type, []);
                oldEntry.push(...oldHandlers);
            }
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
            callStack: new Error('').stack,
            registerTime: Date.now(),
            executionStatistics: []
        });

        return () => {
            const i = entry.findIndex(h => h.cb === cb);
            if (i < 0) {
                return;
            }

            const oldHandlers = entry.splice(i, 1);

            if (this.cacheOldCallbacks) {
                const oldEntry = getOrCreate(this.newIdHandler, type, []);
                oldEntry.push(...oldHandlers);
            }
        };
    }

    // ######## status & statistics ########

    /**
     * Get the number of objects that were processed by the buffer.
     */
    get totalObjectCount(): number {
        return this.totalExecutionCount;
    }

    /**
     * Get the number of objects that wait to be processed.
     */
    get pendingObjectCount(): number {
        return this.buffer.length;
    }

    statistics(): PublicHandlerInfo[] {
        const arr: PublicHandlerInfo[] = [];

        for (const [key, handler] of [
            ...this.newVersionHandler.entries(),
            ...this.oldVersionHandler.entries()
        ]) {
            let filter: VersionedFilterType;
            const elems = key.split('+');

            if (elems.length === 2) {
                filter = {
                    filterType: ensureVersionedObjectTypeName(elems[0]),
                    filterIdHash: ensureIdHash(elems[1])
                };
            } else if (elems.length === 1) {
                if (elems[0] !== '*') {
                    filter = {
                        filterType: '*',
                        filterIdHash: '*'
                    };
                } else {
                    filter = {
                        filterType: ensureVersionedObjectTypeName(elems[0]),
                        filterIdHash: '*'
                    };
                }
            } else {
                throw new Error('Internal formatting error (1)');
            }

            for (const h of handler) {
                arr.push({
                    type: 'onNewVersion',
                    ...filter,
                    ...h
                });
            }
        }

        for (const [key, handler] of [
            ...this.newUnversionedObjectHandler.entries(),
            ...this.oldUnversionedObjectHandler.entries()
        ]) {
            for (const h of handler) {
                arr.push({
                    type: 'onUnversionedObject',
                    filterType: key,
                    ...h
                });
            }
        }

        for (const [key, handler] of [
            ...this.newIdHandler.entries(),
            ...this.oldIdHandler.entries()
        ]) {
            for (const h of handler) {
                arr.push({
                    type: 'onIdObject',
                    filterType: key,
                    ...h
                });
            }
        }

        return arr;
    }

    dump(): void {
        console.log(this.buffer.length, this.buffer.pendingPromiseCount);
        console.log(JSON.stringify([...this.newVersionHandler.entries()], null, 4));
        console.log(JSON.stringify([...this.newUnversionedObjectHandler.entries()], null, 4));
        console.log(JSON.stringify([...this.newIdHandler.entries()], null, 4));
    }

    // #### Private stuff ####

    reportError(error: any): void {
        if (this.onError.listenerCount() > 0) {
            this.onError.emit(error);
        } else {
            console.error('ObjectEventDispatcher: Error during event processing', error);
        }
    }

    private appendToBufferIfNew(
        result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    ) {
        if (result.status === 'exists') {
            return;
        }

        // Only enqueue if there is a handler for it
        if (this.enableEnqueueFiltering && this.getHandler(result).length === 0) {
            return;
        }

        this.buffer.add(result);
        this.onGlobalStatisticChanged.emit();

        // TODO: write to disk
    }

    private async markAsDone(
        result: VersionedObjectResult | UnversionedObjectResult | IdObjectResult
    ) {
        // TODO: remove it from disk
    }

    private async dispatchHandler<
        T extends UnversionedObjectResult | VersionedObjectResult | IdObjectResult
    >(result: T, handler: HandlerInfo<T>[]): Promise<void> {
        if (this.enableStatistics) {
            for (const h of handler) {
                // Create statistics container
                const stats: HandlerInfo<T>['executionStatistics'][0] = {
                    startTime: Date.now(),
                    hash: result.hash || undefined,
                    idHash: result.idHash || undefined
                };
                h.executionStatistics.push(stats);

                // Trim statistics to max value
                if (
                    this.maxStatisticsPerCallback > -1 &&
                    h.executionStatistics.length > this.maxStatisticsPerCallback
                ) {
                    h.executionStatistics.splice(
                        0,
                        this.maxStatisticsPerCallback - h.executionStatistics.length
                    );
                }

                // Execute and record end time & errors
                try {
                    await h.cb(result);
                    stats.endTime = Date.now();
                } catch (e) {
                    stats.endTime = Date.now();
                    stats.error = e;
                    this.onError.emit(e);
                }
            }
        } else {
            for (const h of handler) {
                try {
                    await h.cb(result);
                } catch (e) {
                    this.onError.emit(e);
                }
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

                if (this.pausePromise) {
                    await this.pausePromise;
                }

                if (this.stopped) {
                    resolvePromise();
                    break;
                }
            } catch (e) {
                resolvePromise();
                break;
            }

            await this.dispatchHandler(result, this.getHandler(result));
            await this.markAsDone(result);
            ++this.totalExecutionCount;
            this.onGlobalStatisticChanged.emit();

            if (this.stopped) {
                resolvePromise();
                break;
            }
        }
    }

    /**
     * Get handler that are registered for this result.
     *
     * Note: Somehow the as casts are needed, because typescript does not recognize, that a
     * VersionedObjectResult always leads to an Array of HandlerInfo<VersionedObjectResult> and
     * so on for unversioned and Id ...
     * That is why the 'as' casts are needed.
     *
     * @param result
     */
    private getHandler<T extends VersionedObjectResult | UnversionedObjectResult | IdObjectResult>(
        result: T
    ): HandlerInfo<T>[] {
        if (isVersionedResult(result)) {
            return [
                ...(this.newVersionHandler.get(result.obj.$type$) || []),
                ...(this.newVersionHandler.get(`${result.obj.$type$}+${result.idHash}`) || []),
                ...(this.newVersionHandler.get('*') || [])
            ] as HandlerInfo<T>[];
        } else if (isUnversionedResult(result)) {
            return [
                ...(this.newUnversionedObjectHandler.get(result.obj.$type$) || []),
                ...(this.newUnversionedObjectHandler.get('*') || [])
            ] as HandlerInfo<T>[];
        } else {
            return [
                ...(this.newIdHandler.get(result.obj.$type$) || []),
                ...(this.newIdHandler.get('*') || [])
            ] as HandlerInfo<T>[];
        }
    }
}

// Temporary global, until we adjusted the architecture

export const objectEvents = new ObjectEventDispatcher();
