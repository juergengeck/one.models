import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {WbcObservation} from '@OneCoreTypes';
import {createMessageBus} from 'one.core/lib/message-bus';
import {createEvent} from '../misc/OEvent';
import {Model} from './Model';
const MessageBus = createMessageBus('WbcDiffModel');

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class WbcDiffModel extends EventEmitter implements Model {
    public onUpdated = createEvent<() => void>();
    channelManager: ChannelManager;
    channelId: string;

    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelId = 'wbc';
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit();
        }
    }

    /**
     * Create a new response for a questionnaire.
     *
     * @param {string} wbcObservation - The answers for the questionnaire
     */
    async postObservation(wbcObservation: WbcObservation): Promise<void> {
        MessageBus.send('log', `postMeasurement()`);

        // Verify number format of *Count fields
        const numberRegex = /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/;

        let property: keyof WbcObservation;
        for (property in wbcObservation) {
            if (property !== 'acquisitionTime' && property !== '$type$') {
                const wbcMeasurement = wbcObservation[property];
                if (wbcMeasurement !== undefined) {
                    const stringNumber = wbcMeasurement.value;
                    if (!numberRegex.test(stringNumber)) {
                        throw new Error(
                            `${stringNumber} of ${property} is not a valid Number format`
                        );
                    }
                }
            }
        }

        // post wbc measurement to channel
        await this.channelManager.postToChannel(this.channelId, wbcObservation);
    }

    /**
     * returns all WbcObservations from the channel
     */
    async observations(): Promise<ObjectData<WbcObservation>[]> {
        return await this.channelManager.getObjectsWithType('WbcObservation');
    }

    /**
     * returns the WbcObservation with that specific id provided by the ObjectData type
     */
    async observationById(id: string): Promise<ObjectData<WbcObservation>> {
        return await this.channelManager.getObjectWithTypeById(id, 'WbcObservation');
    }
}
