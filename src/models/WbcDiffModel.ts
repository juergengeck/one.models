import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {WbcObservation} from '@OneCoreTypes';

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
     * @param {string} wbcObservation - The answers for the questionnaire
     */
    async postMeasurement(wbcObservation: WbcObservation): Promise<void> {
        wbcObservation = Object.assign({}, wbcObservation); // shallow copy, because we modify it

        // Verify number format of *Count fields
        const numberRegex = /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/;

        let property: keyof WbcObservation;
        for (property in wbcObservation) {
            if (property !== 'acquisitonTime' && property !== '$type$') {
                const stringNumber = wbcObservation[property].value;
                if (!numberRegex.test(stringNumber)) {
                    throw new Error(`${stringNumber} of ${property} is not a valid Number format`);
                }
            }
        }

        // post wbc measurement to channel
        await this.channelManager.postToChannel(this.channelId, wbcObservation);
        this.emit('updated');
    }

    /**
     * returns all the wbc measurements from the channel
     */
    async measurements(): Promise<ObjectData<WbcObservation>[]> {
        return await this.channelManager.getObjectsWithType('WbcObservation');
    }

    /**
     * returns the wbc measurement with that specific id provided by the ObjectData type
     */
    async getEntryById(id: string): Promise<ObjectData<WbcObservation>> {
        return await this.channelManager.getObjectWithTypeById(id, 'WbcObservation');
    }
}
