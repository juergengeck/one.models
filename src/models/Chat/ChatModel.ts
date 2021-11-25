import {Model} from '../Model';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Group, OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import TopicRegistry from './TopicRegistry';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import {OEvent} from '../../misc/OEvent';
import type {Topic} from '../../recipes/ChatRecipes';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from '@refinio/one.core/lib/storage';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import TopicRoom from './TopicRoom';
import {getObjectByIdHash} from '@refinio/one.core/lib/storage-versioned-objects';

export default class ChatModel extends Model {
    private readonly channelManager: ChannelManager;
    private readonly ChannelRegistryLOCK = 'onChannelRegistryOperation';

    private topicRegistry: TopicRegistry | undefined;
    private channelDisconnect: (() => void) | undefined;

    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    private readonly boundNewTopicFromResult: (
        unversionedObjectResult: UnversionedObjectResult
    ) => void;

    /**
     * Notify the user whenever a new topic is created or received.
     */
    public onNewTopicEvent = new OEvent<() => void>();

    /**
     * Notify the user whenever a new chat message is received. This can be used as a
     * notification system too.
     */
    public onNewChatMessageEvent = this.onUpdated;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.boundOnChannelUpdated = this.onChannelUpdated.bind(this);
        this.boundNewTopicFromResult = this.emitNewTopicEvent.bind(this);
    }

    /**
     * Register listeners.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');
        this.topicRegistry = await TopicRegistry.load();

        this.channelDisconnect = this.channelManager.onUpdated(this.boundOnChannelUpdated);
        this.state.triggerEvent('init');
    }

    /**
     * De-register the listeners.
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.channelDisconnect !== undefined) {
            this.channelDisconnect();
        }

        onUnversionedObj.removeListener(this.boundNewTopicFromResult);
        this.state.triggerEvent('shutdown');
    }

    /**
     * Creates the topic and the channel for the topic.
     * @param participants
     * @param name
     */
    public async createTopic(
        participants: SHA256IdHash<Person>[] | SHA256IdHash<Group>,
        name?: string
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const topicName = name === undefined ? await createRandomString() : name;
        const randomChannelId = await createRandomString();
        await this.channelManager.createChannel(randomChannelId);
        const channels = await this.channelManager.channels({channelId: randomChannelId});

        if (channels[0] === undefined) {
            throw new Error('Error: no channel was created, this should not happen.');
        }

        const createdChannel = channels[0];

        const topic = await this.topicRegistry.addTopic({
            name: topicName,
            channel: await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                owner: createdChannel.owner,
                id: createdChannel.id
            })
        });

        const topicRoom = new TopicRoom(topic, this.channelManager);

        if (participants.length !== undefined) {
            await topicRoom.shareTopicWithPersons(
                participants as SHA256IdHash<Person>[],
                await calculateHashOfObj(topic)
            );
        } else {
            await topicRoom.shareTopicWithGroup(
                participants as SHA256IdHash<Group>,
                await calculateHashOfObj(topic)
            );
        }
    }

    public async enterTopic(topic: Topic): Promise<TopicRoom> {
        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const foundTopic = await this.topicRegistry.retrieveTopicByChannelId(topic.channel);

        if (foundTopic === undefined) {
            throw new Error('Error: topic could not be found');
        }

        return new TopicRoom(foundTopic, this.channelManager);
    }

    /**
     * Lists all the topics in the TopicRegistry
     */
    public async listTopics(): Promise<Topic[]> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        return await this.topicRegistry.retrieveAllTopics();
    }

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation)
     * @param channelId
     * @param channelOwner
     * @param data
     * @private
     */
    private async onChannelUpdated(
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) {
        if (data.data.$type$ === 'ChatMessage') {
            this.onNewChatMessageEvent.emit(channelId, data.data);
        }
    }

    /**
     * Emit the appropriate event for a new topic. Add it to the topic registry.
     * @param result
     * @private
     */
    private async emitNewTopicEvent(result: UnversionedObjectResult): Promise<void> {
        if (result.obj.$type$ === 'Topic' && result.status === 'new') {
            const {channel, name} = result.obj;
            await serializeWithType(this.ChannelRegistryLOCK, async () => {
                if (this.topicRegistry === undefined) {
                    throw new Error(
                        'Error while retrieving topic registry, model not initialised.'
                    );
                }

                await this.topicRegistry.addTopic({channel, name});
            });
            this.onNewTopicEvent.emit();
        }
    }
}
