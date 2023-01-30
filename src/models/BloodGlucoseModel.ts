/**
 * @author Sebastian Ganea <sebastian.ganea@refinio.net>
 */

import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {Model} from './Model';

import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {BloodGlucose} from '../recipes/BloodGlucoseRecipes';

export default class BloodGlucoseModel extends Model {
    private disconnect: (() => void) | undefined;
    private readonly channelManager: ChannelManager;
    public static readonly channelId = 'bloodGlucose';

    /**
     * Construct a new instance
     *
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        await this.channelManager.createChannel(BloodGlucoseModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));
        this.state.triggerEvent('init');
    }

    /**
     *
     * @param BGSampleObject
     */
    async postBloodGlucose(BGSampleObject: BloodGlucose): Promise<void> {
        this.state.assertCurrentState('Initialised');

        await this.channelManager.postToChannel(
            BloodGlucoseModel.channelId,
            BGSampleObject,
            undefined,
            BGSampleObject.startTimestamp
        );
    }

    /**
     *
     * @returns
     */
    async retrieveAllWithoutData(): Promise<ObjectData<BloodGlucose>[]> {
        this.state.assertCurrentState('Initialised');

        return await this.channelManager.getObjectsWithType('BloodGlucose', {
            omitData: true,
            channelId: BloodGlucoseModel.channelId
        });
    }

    async retrieveWithQueryOptions(
        queryOptions: QueryOptions
    ): Promise<ObjectData<BloodGlucose>[]> {
        this.state.assertCurrentState('Initialised');

        return await this.channelManager.getObjectsWithType('BloodGlucose', {
            ...queryOptions,
            channelId: BloodGlucoseModel.channelId
        });
    }

    /**
     *
     * @param bloodGlucoseHash
     * @returns
     */
    async retrieveBloodGlucoseByHash(
        bloodGlucoseHash: SHA256Hash<BloodGlucose>
    ): Promise<BloodGlucose> {
        this.state.assertCurrentState('Initialised');

        return await getObject(bloodGlucoseHash);
    }

    /**
     * returns iterator for BloodGlucose
     * @param queryOptions
     */
    async *bloodGlucoseIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<BloodGlucose>> {
        this.state.assertCurrentState('Initialised');

        yield* this.channelManager.objectIteratorWithType('BloodGlucose', {
            ...queryOptions,
            channelId: BloodGlucoseModel.channelId
        });
    }

    /**
     * Returns the start timestamp of the last Blood Glucose available in the channel or 0 otherwise.
     * @private
     */
    async getLastBloodGlucoseTimestamp(): Promise<number> {
        this.state.assertCurrentState('Initialised');

        let lastBloodGlucoseStartimestamp = 0;
        const bloodGlucose = await this.channelManager.getObjectsWithType('BloodGlucose', {
            count: 1,
            channelId: BloodGlucoseModel.channelId
        });

        if (bloodGlucose.length > 0 && bloodGlucose[0].data.startTimestamp) {
            lastBloodGlucoseStartimestamp = bloodGlucose[0].data.startTimestamp;
        }

        return lastBloodGlucoseStartimestamp;
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    /**
     * Handler function for the 'updated' event
     * @param id
     * @param data
     */
    private async handleChannelUpdate(
        id: string,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === BloodGlucoseModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
