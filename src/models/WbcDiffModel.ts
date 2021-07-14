import {EventEmitter} from 'events';
import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {createMessageBus} from 'one.core/lib/message-bus';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {WbcObservation} from '../recipes/WbcDiffRecipes';
const MessageBus = createMessageBus('WbcDiffModel');

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class WbcDiffModel extends EventEmitter implements Model {
    /**
     * Event is emitted when the wbc data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();
    channelManager: ChannelManager;
    public static readonly channelId = 'wbc';

    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(WbcDiffModel.channelId);
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
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === WbcDiffModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
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
        await this.channelManager.postToChannel(WbcDiffModel.channelId, wbcObservation);
    }

    /**
     * returns all WbcObservations from the channel
     */
    async observations(): Promise<ObjectData<WbcObservation>[]> {
        return await this.channelManager.getObjectsWithType('WbcObservation');
    }

    /**
     * returns iterator for observations
     * @param queryOptions
     */
    async *observationsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<WbcObservation>> {
        yield* this.channelManager.objectIteratorWithType('WbcObservation', {
            ...queryOptions,
            channelId: WbcDiffModel.channelId
        });
    }

    /**
     * returns the WbcObservation with that specific id provided by the ObjectData type
     */
    async observationById(id: string): Promise<ObjectData<WbcObservation>> {
        return await this.channelManager.getObjectWithTypeById(id, 'WbcObservation');
    }
}
