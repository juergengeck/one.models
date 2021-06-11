/**
 * @author Sebastian Ganea <sebastian.ganea@refinio.net>
 */

import EventEmitter from 'events';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {getObject} from 'one.core/lib/storage';
import {
    BloodGlucose,
    OneUnversionedObjectTypes,
    Person,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';
import {OEvent} from '../misc/OEvent';
import {Model} from './Model';

export default class BloodGlucoseModel extends EventEmitter implements Model{
    /**
     * Event emitted when BloodGlucose data is updated.
     */
    public onUpdated = new OEvent<(data?: ObjectData<OneUnversionedObjectTypes>) => void>();

    private disconnect: (() => void) | undefined;
    private readonly channelManager: ChannelManager;
    private readonly channelId: string;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();
        this.channelId = 'bloodGlucose';
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));
    }

    /**
     *
     * @param {BloodGlucose} BGSampleObject
     * @returns {Promise<void>}
     */
    async postBloodGlucose(BGSampleObject: BloodGlucose): Promise<void> {
        await this.channelManager.postToChannel(
            this.channelId,
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
            channelId: this.channelId
        });
    }

    async retrieveWithQueryOptions(
        queryOptions: QueryOptions
    ): Promise<ObjectData<BloodGlucose>[]> {
        return await this.channelManager.getObjectsWithType('BloodGlucose', {
            ...queryOptions,
            channelId: this.channelId
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
            channelId: this.channelId
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
            channelId: this.channelId
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
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }

}