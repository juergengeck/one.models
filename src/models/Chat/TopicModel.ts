import {Model} from '../Model';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Group, OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import TopicRegistry from './TopicRegistry';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import {
    createSingleObjectThroughPurePlan, getObjectByIdHash,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from "@refinio/one.core/lib/storage";
import {OEvent} from '../../misc/OEvent';
import type {Topic} from '../../recipes/ChatRecipes';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import TopicRoom from './TopicRoom';

/**
 * Model that manages the creation of chat topics.
 */
export default class TopicModel extends Model {
    private readonly channelManager: ChannelManager;
    private readonly TopicRegistryLOCK = 'ON_TOPIC_REGISTRY_OPERATION';

    private topicRegistry: TopicRegistry | undefined;

    public static readonly EVERYONE_TOPIC_ID = 'EveryoneTopic'

    /**
     * Notify the user whenever a new topic is created or received.
     */
    public onNewTopicEvent = new OEvent<() => void>();

    /**
     * Notify the user whenever a new chat message is received. This can be used as a
     * notification system.
     */
    public onNewChatMessageEvent = this.onUpdated;

    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;
    private readonly boundNewTopicFromResult: (
        unversionedObjectResult: UnversionedObjectResult
    ) => void;
    private channelDisconnect: (() => void) | undefined;

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
        onUnversionedObj.addListener(this.boundNewTopicFromResult);

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
     * Creates the default everyone topic
     */
    public async createEveryoneTopic(): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const exist = await this.doesTopicExists(TopicModel.EVERYONE_TOPIC_ID);
        if(exist){
            // because the topic exist - can't return undefined
            return await this.topicRegistry.retrieveTopicByChannelId(TopicModel.EVERYONE_TOPIC_ID) as Topic
        }
        return await this.createNewTopic('Everyone', TopicModel.EVERYONE_TOPIC_ID)
    }

    /**
     * Creates one to one topic (person to person)
     * @param topicName
     * @param from
     * @param to
     */
    public async createOneToOneTopic(topicName: string, from: SHA256IdHash<Person>, to: SHA256IdHash<Person>): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        return await this.createNewTopic(topicName, `${from}->${to}`)
    }

    /**
     * Creates group topic (multiplePerson)
     * @param topicName
     */
    public async createGroupTopic(topicName: string): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        return await this.createNewTopic(topicName);
    }

    /**
     * Enter the topic room by the given topic
     * @param topic
     */
    public async enterTopicRoom(topic: Topic): Promise<TopicRoom> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const channel = await getObjectByIdHash(topic.channel)

        const foundTopic = await this.topicRegistry.retrieveTopicByChannelId(channel.obj.id);

        if (foundTopic === undefined) {
            throw new Error('Error while trying to retrieve the topic. The topic does not exist.');
        }

        const topicRoom = new TopicRoom(foundTopic, this.channelManager);
        await topicRoom.load();
        return topicRoom;
    }

    public async doesTopicExists(channelId: string): Promise<boolean> {
        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const result = await this.topicRegistry.retrieveTopicByChannelId(channelId)
        return result !== undefined;

    }

    /**
     * Lists all the topics in the TopicRegistry
     */
    public async listAllTopics(): Promise<Topic[]> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        return await this.topicRegistry.retrieveAllTopics();
    }

    /**
     * Share the given topic with the desired persons.
     * @param participants
     * @param topic
     */
    public async addPersonsToTopic(
        participants: SHA256IdHash<Person>[],
        topic: Topic
    ): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    object: await calculateHashOfObj(topic),
                    person: participants,
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

    /**
     * Share the given topic with the desired persons.
     * @param groupIdHash
     * @param topic
     */
    public async addGroupToTopic(
        groupIdHash: SHA256IdHash<Group>,
        topic: Topic
    ): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    object: await calculateHashOfObj(topic),
                    person: [],
                    group: [groupIdHash],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

    // --------------------------------- private ---------------------------------

    /**
     * Creates a new topic.
     * @param desiredTopicName
     * @param desiredChannelTopicId
     */
    private async createNewTopic(desiredTopicName?: string, desiredChannelTopicId?: string): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        // if no name was passed, generate a random one
        const topicName = desiredTopicName === undefined ? await createRandomString() : desiredTopicName;
        // generate a random channel id
        const topicChannelId = desiredChannelTopicId === undefined ? await createRandomString() : desiredChannelTopicId;

        await this.channelManager.createChannel(topicChannelId);
        const channels = await this.channelManager.channels({channelId: topicChannelId});

        if (channels[0] === undefined) {
            throw new Error(
              "Error while trying to retrieve the topic's channel. The channel" +
              ' does not exist.'
            );
        }

        const createdChannel = channels[0];

        const savedTopic = await createSingleObjectThroughPurePlan(
          {
              module: '@one/identity',
              versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
          },
          {
              $type$: 'Topic',
              channel: await calculateIdHashOfObj({
                  $type$: 'ChannelInfo',
                  id: createdChannel.id,
                  owner: createdChannel.owner
              }),
              name: topicName
          }
        );

        return savedTopic.obj;
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
            await serializeWithType(this.TopicRegistryLOCK, async () => {
                if (this.topicRegistry === undefined) {
                    throw new Error(
                        'Error while retrieving topic registry, model not initialised.'
                    );
                }

                await this.topicRegistry.registerTopic(result as UnversionedObjectResult<Topic>);
            });
            this.onNewTopicEvent.emit();
        }
    }
}
