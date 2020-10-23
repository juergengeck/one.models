/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {getObject} from 'one.core/lib/storage';
import {Electrocardiogram, OneUnversionedObjectTypes, SHA256Hash} from '@OneCoreTypes';
import {ElectrocardiogramReadings} from '../recipes/ECGRecipes';

export default class ECGModel extends EventEmitter {
    private readonly channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;
    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();
        this.channelId = 'electrocardiogram';
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleChannelUpdate.bind(this);
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     *
     * @param {Electrocardiogram} ECGObject
     * @returns {Promise<void>}
     */
    async postECG(ECGObject: Electrocardiogram): Promise<void> {
        await this.channelManager.postToChannel(this.channelId, ECGObject);
    }

    /**
     *
     * @returns {Promise<ObjectData<OneUnversionedObjectTypes>[]>}
     */
    async retrieveAll(): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        return await this.channelManager.getObjects({channelId: this.channelId});
    }

    /**
     *
     * @param {SHA256Hash<Electrocardiogram>} electrocardiogramHash
     * @returns {Promise<ObjectData<Electrocardiogram>>}
     */
    async retrieveElectrocardiogramByHash(electrocardiogramHash: SHA256Hash<Electrocardiogram>): Promise<Electrocardiogram> {
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
        const ecgReadings: ElectrocardiogramReadings[] = await this.retrieveAllECGReadings(electrocardiogramHash);

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
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
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
     * @return {Promise<void>}
     */
    private async handleChannelUpdate(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
