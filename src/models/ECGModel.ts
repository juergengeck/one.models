/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {getObject} from 'one.core/lib/storage';
import {
    Electrocardiogram,
    OneUnversionedObjectTypes,
    Person,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';
import {ElectrocardiogramReadings} from '../recipes/ECGRecipes';
import {OEvent} from '../misc/OEvent';
import {Model} from './Model';

export default class ECGModel extends EventEmitter implements Model {
    /**
     * Event emitted when ecg data is updated.
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
        this.channelId = 'electrocardiogram';
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
     * @param {Electrocardiogram} ECGObject
     * @returns {Promise<void>}
     */
    async postECG(ECGObject: Electrocardiogram): Promise<void> {
        await this.channelManager.postToChannel(
            this.channelId,
            ECGObject,
            undefined,
            ECGObject.startTimestamp
        );
    }

    /**
     *
     * @returns {Promise<ObjectData<Electrocardiogram>[]>}
     */
    async retrieve(queryOptions?: QueryOptions): Promise<ObjectData<Electrocardiogram>[]> {
        return await this.channelManager.getObjectsWithType('Electrocardiogram', {
            ...queryOptions,
            channelId: this.channelId
        });
    }

    /**
     *
     * @param {SHA256Hash<Electrocardiogram>} electrocardiogramHash
     * @returns {Promise<ObjectData<Electrocardiogram>>}
     */
    async retrieveElectrocardiogramByHash(
        electrocardiogramHash: SHA256Hash<Electrocardiogram>
    ): Promise<Electrocardiogram> {
        return await getObject(electrocardiogramHash);
    }

    /**
     * Retrieve all the readings from an ECG
     * @param {SHA256Hash<Electrocardiogram>} electrocardiogramHash
     * @returns {Promise<ElectrocardiogramReadings[]>}
     */
    async retrieveAllECGReadings(
        electrocardiogramHash: SHA256Hash<Electrocardiogram>
    ): Promise<ElectrocardiogramReadings[]> {
        const {readings} = await getObject(electrocardiogramHash);
        return readings ? readings : [];
    }

    /**
     * Returns the start timestamp of the last ECG available in the channel or 0 otherwise.
     * @private
     */
    async getLastECGTimestamp(): Promise<number> {
        let lastECGStartimestamp = 0;
        const ecgs = await this.channelManager.getObjectsWithType('Electrocardiogram', {
            count: 1,
            channelId: this.channelId
        });

        if (ecgs.length > 0 && ecgs[0].data.startTimestamp) {
            lastECGStartimestamp = ecgs[0].data.startTimestamp;
        }

        return lastECGStartimestamp;
    }

    /**
     * Paginated
     * @param {SHA256Hash<Electrocardiogram>} electrocardiogramHash
     * @param {number} pageSize - DEFAULT = 100
     * @param {number} from - (Returned by this function) use only the returned value of nextFrom field for this parameter
     * @returns {Promise<{readings: ElectrocardiogramReadings[], nextFrom?: number}>}
     */
    async retrieveECGReadings(
        electrocardiogramHash: SHA256Hash<Electrocardiogram>,
        from = -1,
        pageSize = 100
    ): Promise<{readings: ElectrocardiogramReadings[]; nextFrom?: number}> {
        const ecgReadings: ElectrocardiogramReadings[] = await this.retrieveAllECGReadings(
            electrocardiogramHash
        );

        if (from !== -1) {
            const endIndex = this.findReadingIndex(ecgReadings, from);

            if (endIndex !== undefined) {
                /** if the value it's negative, make it 0 meaning the start of the array **/
                const startIndex = endIndex - 100 < 0 ? 0 : endIndex - 100;
                return {readings: ecgReadings.slice(startIndex, endIndex), nextFrom: startIndex};
            }
            return {readings: []};
        }
        const endIndex = ecgReadings.length - 1;
        /** if the value it's negative, make it 0 meaning the start of the array **/
        const startIndex = endIndex - 100 < 0 ? 0 : endIndex - 100;
        return {readings: ecgReadings.slice(startIndex, endIndex), nextFrom: startIndex};
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
     * Binary Search since elements in the readings are sorted
     * @param {ElectrocardiogramReadings[]} readings
     * @param {number} target
     * @returns {number | undefined}
     * @private
     */
    private findReadingIndex(
        readings: ElectrocardiogramReadings[],
        target: number
    ): number | undefined {
        let startIndex = 0;
        let endIndex = readings.length - 1;
        while (startIndex <= endIndex) {
            let middleIndex = Math.floor((startIndex + endIndex) / 2);
            if (target === readings[middleIndex].timeSinceSampleStart) {
                return middleIndex;
            }
            if (target > readings[middleIndex].timeSinceSampleStart) {
                startIndex = middleIndex + 1;
            }
            if (target < readings[middleIndex].timeSinceSampleStart) {
                endIndex = middleIndex - 1;
            }
        }
        return undefined;
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
