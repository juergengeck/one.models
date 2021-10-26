import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {createMessageBus} from 'one.core/lib/message-bus';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import {createModelStateMachine} from './Model';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {WbcObservation} from '../recipes/WbcDiffRecipes';
import type {StateMachine} from '../misc/StateMachine';
const MessageBus = createMessageBus('WbcDiffModel');

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class WbcDiffModel implements Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    /**
     * Event is emitted when the wbc data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();
    channelManager: ChannelManager;
    public static readonly channelId = 'wbc';

    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        this.channelManager = channelManager;
        this.state = createModelStateMachine();
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(WbcDiffModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    /**
     * Create a new response for a questionnaire.
     *
     * @param wbcObservation - The answers for the questionnaire
     */
    async postObservation(wbcObservation: WbcObservation): Promise<void> {
        this.state.assertCurrentState('Initialised');

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
        this.state.assertCurrentState('Initialised');

        return await this.channelManager.getObjectsWithType('WbcObservation', {
            channelId: WbcDiffModel.channelId
        });
    }

    /**
     * returns iterator for observations
     * @param queryOptions
     */
    async *observationsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<WbcObservation>> {
        this.state.assertCurrentState('Initialised');

        yield* this.channelManager.objectIteratorWithType('WbcObservation', {
            ...queryOptions,
            channelId: WbcDiffModel.channelId
        });
    }

    /**
     * returns the WbcObservation with that specific id provided by the ObjectData type
     */
    async observationById(id: string): Promise<ObjectData<WbcObservation>> {
        this.state.assertCurrentState('Initialised');

        return await this.channelManager.getObjectWithTypeById(id, 'WbcObservation');
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     * @param owner
     * @param data
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === WbcDiffModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
