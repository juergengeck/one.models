import {Model} from './Model';
import {OEvent} from '../misc/OEvent';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {OneUnversionedObjectTypes, Person, SHA256IdHash, HeartEvent} from '@OneCoreTypes';
import EventEmitter from 'events';

/**
 * This model implements the possibility of adding or retrieving HeartEvents that occurred on the apple watch.
 * Those Events can be {@link HEART_OCCURRING_EVENTS}
 * For more information, see Chapter Vital Signs in {@link https://developer.apple.com/documentation/healthkit/data_types}
 */
export default class HeartEventModel extends EventEmitter implements Model {
    /**
     * Event emitted when HeartEvent data is updated.
     */
    public onUpdated = new OEvent<(data?: ObjectData<OneUnversionedObjectTypes>) => void>();

    private readonly channelManager: ChannelManager;
    public static readonly channelId: string = 'heartEvent';

    /**
     * Disconnect function to detach the channel manager listener
     * @private
     */
    private disconnect: (() => void) | undefined;

    /**
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    /**
     * Initialize the model
     */
    public async init(): Promise<void> {
        await this.channelManager.createChannel(HeartEventModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown the model
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Adds a HeartEvent
     * @param {HeartEvent} heartEvent
     */
    public async addHeartEvent(heartEvent: HeartEvent): Promise<void> {
        await this.channelManager.postToChannel(HeartEventModel.channelId, heartEvent);
    }

    /**
     * Get all the heartEvents
     */
    public async heartEvents(): Promise<ObjectData<HeartEvent>[]> {
        return await this.channelManager.getObjectsWithType('HeartEvent', {
            channelId: HeartEventModel.channelId
        });
    }

    /**
     * returns iterator for Heart Events
     * @param queryOptions
     */
    public async *heartEventsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<HeartEvent>> {
        for await (const entry of this.channelManager.objectIteratorWithType('HeartEvent', {
            ...queryOptions,
            channelId: HeartEventModel.channelId
        })) {
            yield entry;
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
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === HeartEventModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
