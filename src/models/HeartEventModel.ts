
import type {Model} from './Model';
import {OEvent} from '../misc/OEvent';
import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {HeartEvent} from '../recipes/HeartEventRecipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';

/**
 * This model implements the possibility of adding or retrieving HeartEvents that occurred on the Apple watch.
 * Those Events can be {@link HEART_OCCURRING_EVENTS}
 * For more information, see Chapter Vital Signs in {@link https://developer.apple.com/documentation/healthkit/data_types}
 */
export default class HeartEventModel  implements Model {
    /**
     * Event emitted when HeartEvent data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();

    private readonly channelManager: ChannelManager;
    public static readonly channelId = 'heartEvent';

    /**
     * Disconnect function to detach the channel manager listener
     * @private
     */
    private disconnect: (() => void) | undefined;

    /**
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
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
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Adds a HeartEvent
     * @param heartEvent
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
     * @param id
     * @param owner
     * @param data
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === HeartEventModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
