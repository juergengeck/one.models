/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {getObject, onUnversionedObj} from 'one.core/lib/storage';
import {
    Electrocardiogram,
    OneUnversionedObjectTypes,
    SHA256Hash,
    UnversionedObjectResult
} from '@OneCoreTypes';
import {ElectrocardiogramReadings} from '../recipes/ECGRecipes';

export default class ECGModel extends EventEmitter {
    private readonly channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly boundOnUnVersionedObjHandler: (
        caughtObject: UnversionedObjectResult
    ) => Promise<void>;
    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();
        this.channelId = 'Electrocardiogram';
        this.channelManager = channelManager;
        this.boundOnUnVersionedObjHandler = this.handleOnUnVersionedObj.bind(this);
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
    }

    /**
     *
     * @param {Electrocardiogram} ECGObject
     * @returns {Promise<void>}
     */
    async postECG(ECGObject: Electrocardiogram): Promise<void> {
        await this.channelManager.postToChannel(this.channelId, ECGObject);
        this.emit('updated');
    }

    /**
     *
     * @returns {Promise<ObjectData<OneUnversionedObjectTypes>[]>}
     */
    async retrieveAll(): Promise<ObjectData<OneUnversionedObjectTypes>[]> {
        return await this.channelManager.getObjects({channelId: this.channelId});
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
        const ecgReadings: ElectrocardiogramReadings[] = (await getObject(electrocardiogramHash))
            .readings;

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
        onUnversionedObj.removeListener(this.boundOnUnVersionedObjHandler);
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
            if (target === readings[middleIndex].timeSinceSimpleStart) {
                return middleIndex;
            }
            if (target > readings[middleIndex].timeSinceSimpleStart) {
                startIndex = middleIndex + 1;
            }
            if (target < readings[middleIndex].timeSinceSimpleStart) {
                endIndex = middleIndex - 1;
            }
        }
        return undefined;
    }

    /**
     * Handler function for the UnVersionedObj event
     * @param {UnversionedObjectResult} caughtObject
     * @return {Promise<void>}
     */
    private async handleOnUnVersionedObj(caughtObject: UnversionedObjectResult): Promise<void> {
        if (
            this.isElectrocardiogramUnVersionedObjectResult(caughtObject) &&
            caughtObject.status === 'new'
        ) {
            this.emit('updated');
        }
    }

    /**
     * @description type check
     * @param {UnversionedObjectResult} caughtObject
     * @returns {UnversionedObjectResult<Contact>}
     */
    private isElectrocardiogramUnVersionedObjectResult(
        caughtObject: UnversionedObjectResult
    ): caughtObject is UnversionedObjectResult<Electrocardiogram> {
        return (
            (caughtObject as UnversionedObjectResult<Electrocardiogram>).obj.$type$ ===
            'Electrocardiogram'
        );
    }
}
