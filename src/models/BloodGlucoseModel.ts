/**
 * @author Sebastian Ganea <sebastian.ganea@refinio.net>
 */

import EventEmitter from 'events';
import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {getObject} from 'one.core/lib/storage';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {BloodGlucose} from '../recipes/BloodGlucoseRecipes';

export default class BloodGlucoseModel extends EventEmitter implements Model {
    /**
     * Event emitted when BloodGlucose data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();

    private disconnect: (() => void) | undefined;
    private readonly channelManager: ChannelManager;
    public static readonly channelId = 'bloodGlucose';

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(BloodGlucoseModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));
    }

    /**
     *
     * @param {BloodGlucose} BGSampleObject
     * @returns {Promise<void>}
     */
    async postBloodGlucose(BGSampleObject: BloodGlucose): Promise<void> {
        await this.channelManager.postToChannel(
            BloodGlucoseModel.channelId,
            BGSampleObject,
            undefined,
            BGSampleObject.startTimestamp
        );
    }

    /**
     *
     * @returns {Promise<ObjectData<BloodGlucose>[]>}
     */
    async retrieveAllWithoutData(): Promise<ObjectData<BloodGlucose>[]> {
        return await this.channelManager.getObjectsWithType('BloodGlucose', {
            omitData: true,
            channelId: BloodGlucoseModel.channelId
        });
    }

    async retrieveWithQueryOptions(
        queryOptions: QueryOptions
    ): Promise<ObjectData<BloodGlucose>[]> {
        return await this.channelManager.getObjectsWithType('BloodGlucose', {
            ...queryOptions,
            channelId: BloodGlucoseModel.channelId
        });
    }

    /**
     *
     * @param {SHA256Hash<BloodGlucose>} bloodGlucoseHash
     * @returns {Promise<ObjectData<BloodGlucose>>}
     */
    async retrieveBloodGlucoseByHash(
        bloodGlucoseHash: SHA256Hash<BloodGlucose>
    ): Promise<BloodGlucose> {
        return await getObject(bloodGlucoseHash);
    }

    /**
     * returns iterator for BloodGlucose
     * @param queryOptions
     */
    async *bloodGlucoseIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<BloodGlucose>> {
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
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     *  Handler function for the 'updated' event
     *  @param {string} id
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleChannelUpdate(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === BloodGlucoseModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
