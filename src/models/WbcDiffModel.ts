import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {WbcMeasurement} from '@OneCoreTypes';

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class WbcDiffModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelId = 'wbc';
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }

    /**
     * Create a new response for a questionnaire.
     *
     * @param {string} wbcMeasurement - The answers for the questionnaire
     */
    async postMeasurement(wbcMeasurement: WbcMeasurement): Promise<void> {
        wbcMeasurement = Object.assign({}, wbcMeasurement); // shallow copy, because we modify it
        // Verify the consistency of optional classes
        if (
            !(
                ('neuCount' in wbcMeasurement === 'neuCountUnit' in wbcMeasurement) ===
                'neuCountUnsafe' in wbcMeasurement
            )
        ) {
            throw Error(
                'If one of the fields neuCount, neuCountUnit or neuCountUnsafe is specified, all need to be specified.'
            );
        }

        if (
            !(
                ('lymCount' in wbcMeasurement === 'lymCountUnit' in wbcMeasurement) ===
                'lymCountUnsafe' in wbcMeasurement
            )
        ) {
            throw Error(
                'If one of the fields lymCount, lymCountUnit or lymCountUnsafe is specified, all need to be specified.'
            );
        }

        if (
            !(
                ('monCount' in wbcMeasurement === 'monCountUnit' in wbcMeasurement) ===
                'monCountUnsafe' in wbcMeasurement
            )
        ) {
            throw Error(
                'If one of the fields monCount, monCountUnit or monCountUnsafe is specified, all need to be specified.'
            );
        }

        if (
            !(
                ('eosCount' in wbcMeasurement === 'eosCountUnit' in wbcMeasurement) ===
                'eosCountUnsafe' in wbcMeasurement
            )
        ) {
            throw Error(
                'If one of the fields eosCount, eosCountUnit or eosCountUnsafe is specified, all need to be specified.'
            );
        }

        if (
            !(
                ('basCount' in wbcMeasurement === 'basCountUnit' in wbcMeasurement) ===
                'basCountUnsafe' in wbcMeasurement
            )
        ) {
            throw Error(
                'If one of the fields basCount, basCountUnit or basCountUnsafe is specified, all need to be specified.'
            );
        }

        // Verify number format of *Count fields
        const numberRegex = /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/;

        if (!numberRegex.test(wbcMeasurement.wbcCount)) {
            throw Error('The wbcCount number has wrong format.');
        }

        if (wbcMeasurement.neuCount !== undefined) {
            if (!numberRegex.test(wbcMeasurement.neuCount)) {
                throw Error('The neuCount field has wrong format.');
            }
        }

        if (wbcMeasurement.lymCount !== undefined) {
            if (!numberRegex.test(wbcMeasurement.lymCount)) {
                throw Error('The lymCount field has wrong format.');
            }
        }

        if (wbcMeasurement.monCount !== undefined) {
            if (!numberRegex.test(wbcMeasurement.monCount)) {
                throw Error('The monCount field has wrong format.');
            }
        }

        if (wbcMeasurement.eosCount !== undefined) {
            if (!numberRegex.test(wbcMeasurement.eosCount)) {
                throw Error('The eosCount field has wrong format.');
            }
        }

        if (wbcMeasurement.basCount !== undefined) {
            if (!numberRegex.test(wbcMeasurement.basCount)) {
                throw Error('The basCount field has wrong format.');
            }
        }

        // Verify the supported units(for now verifies 10^9/dL or 1000000000/dL both formats)
        // TODO: Verify the units when they are clear!
        const unitRegex = /^(1000000000)(\/)(dL)|^(10)(\^)(9)(\/)(dL)$/;

        if (!unitRegex.test(wbcMeasurement.wbcCountUnit)) {
            throw Error('The wbcCountUnit number has wrong format.');
        }

        if (wbcMeasurement.neuCountUnit !== undefined) {
            if (!unitRegex.test(wbcMeasurement.neuCountUnit)) {
                throw Error('The neuCountUnit field has wrong format.');
            }
        }

        if (wbcMeasurement.lymCountUnit !== undefined) {
            if (!unitRegex.test(wbcMeasurement.lymCountUnit)) {
                throw Error('The lymCountUnit field has wrong format.');
            }
        }

        if (wbcMeasurement.monCountUnit !== undefined) {
            if (!unitRegex.test(wbcMeasurement.monCountUnit)) {
                throw Error('The monCountUnit field has wrong format.');
            }
        }

        if (wbcMeasurement.eosCountUnit !== undefined) {
            if (!unitRegex.test(wbcMeasurement.eosCountUnit)) {
                throw Error('The eosCountUnit field has wrong format.');
            }
        }

        if (wbcMeasurement.basCountUnit !== undefined) {
            if (!unitRegex.test(wbcMeasurement.basCountUnit)) {
                throw Error('The basCountUnit field has wrong format.');
            }
        }

        // post wbc measurement to channel
        await this.channelManager.postToChannel(this.channelId, wbcMeasurement);
        this.emit('updated');
    }

    /**
     * returns all the wbc measurements from the channel
     */
    async measurements(): Promise<ObjectData<WbcMeasurement>[]> {
        const objects: ObjectData<WbcMeasurement>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType('WbcMeasurement');

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: data});
        }

        return objects;
    }

    /**
     * returns the wbc measurement with that specific id provided by the ObjectData type
     */
    async getEntryById(id: string): Promise<ObjectData<WbcMeasurement>> {
        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            id,
            'WbcMeasurement'
        );
        return {...restObjectData, data: data};
    }
}
