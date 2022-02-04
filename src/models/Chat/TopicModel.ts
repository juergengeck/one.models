import {Model} from '../Model';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Group, OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import TopicRegistry from './TopicRegistry';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from '@refinio/one.core/lib/storage';
import {OEvent} from '../../misc/OEvent';
import type {Topic} from '../../recipes/ChatRecipes';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import TopicRoom from './TopicRoom';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {Plan} from '@refinio/one.core/lib/recipes';

const DUMMY_PLAN_HASH: SHA256Hash<Plan> =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

/**
 * Model that manages the creation of chat topics.
 */
export default class TopicModel extends Model {
    public static readonly EVERYONE_TOPIC_ID = 'EveryoneTopic';

    /**
     * Notify the user whenever a new topic is created or received.
     */
    public onNewTopicEvent = new OEvent<() => void>();

    /**
     * Notify the user whenever a new chat message is received. This can be used as a
     * notification system.
     */
    public onNewChatMessageEvent = this.onUpdated;

    private readonly channelManager: ChannelManager;

    private readonly TopicRegistryLOCK = 'ON_TOPIC_REGISTRY_OPERATION';

    private Topics: TopicRegistry | undefined;

    private readonly boundOnChannelUpdated: (
        channelId: string,
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

        this.Topics = await TopicRegistry.load();
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
     * Retrieves the topic registry. Omit the add & remove functions from the public API. The model
     * takes care of those things.
     */
    public get topics(): Omit<TopicRegistry, 'add' | 'remove'> {
        this.state.assertCurrentState('Initialised');

        // assertCurrentState ensures that the model was initialised - so topics are not undefined
        const topicRegistry = this.Topics as TopicRegistry;

        return {
            all: topicRegistry.all,
            queryById: topicRegistry.queryById,
            queryByName: topicRegistry.queryByName
        };
    }

    /**
     * Enter the topic room by the given topic channel id.
     * @param topicID
     */
    public async enterTopicRoom(topicID: string): Promise<TopicRoom> {
        this.state.assertCurrentState('Initialised');

        if (this.Topics === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const foundTopic = await this.Topics.queryById(topicID);

        if (foundTopic === undefined) {
            throw new Error('Error while trying to retrieve the topic. The topic does not exist.');
        }

        return new TopicRoom(foundTopic, this.channelManager);
    }

    /**
     * Creates the default everyone topic
     */
    public async createEveryoneTopic(): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        if (this.Topics === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const foundTopic = (await this.Topics.queryById(TopicModel.EVERYONE_TOPIC_ID)) as Topic;

        if (foundTopic) {
            return foundTopic;
        }

        return await this.createNewTopic('Everyone', TopicModel.EVERYONE_TOPIC_ID);
    }

    /**
     * Creates one to one topic (person to person)
     * @param topicName
     * @param from
     * @param to
     */
    public async createOneToOneTopic(
        topicName: string,
        from: SHA256IdHash<Person>,
        to: SHA256IdHash<Person>
    ): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        return await this.createNewTopic(topicName, [from, to].sort().join('<->'));
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
                    id: topic.channel,
                    person: participants,
                    group: [],
                    mode: SET_ACCESS_MODE.ADD
                }
            ]
        );
    }

    /**
     * Share the given topic with the desired group.
     * @param groupIdHash
     * @param topic
     */
    public async addGroupToTopic(groupIdHash: SHA256IdHash<Group>, topic: Topic): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    id: topic.channel,
                    person: [],
                    group: [groupIdHash],
                    mode: SET_ACCESS_MODE.ADD
                }
            ]
        );
    }

    // --------------------------------- private ---------------------------------

    /**
     * Creates a new topic.
     * @param desiredTopicName
     * @param desiredTopicID
     */
    private async createNewTopic(
        desiredTopicName?: string,
        desiredTopicID?: string
    ): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        // if no name was passed, generate a random one
        const topicName =
            desiredTopicName === undefined ? await createRandomString() : desiredTopicName;
        // generate a random channel id
        const topicID = desiredTopicID === undefined ? await createRandomString() : desiredTopicID;

        await this.channelManager.createChannel(topicID, null);

        const channels = await this.channelManager.channels({
            channelId: topicID
        });

        if (channels[0] === undefined) {
            throw new Error(
                "Error while trying to retrieve the topic's channel. The channel" +
                    ' does not exist.'
            );
        }

        const createdChannel = channels[0];
        const savedTopic = await storeUnversionedObject({
            $type$: 'Topic',
            id: createdChannel.id,
            channel: await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: createdChannel.id
            }),
            name: topicName
        });

        return savedTopic.obj;
    }

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation)
     * @param channelId
     * @param data
     * @private
     */
    private async onChannelUpdated(channelId: string, data: ObjectData<OneUnversionedObjectTypes>) {
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
                if (this.Topics === undefined) {
                    throw new Error(
                        'Error while retrieving topic registry, model not initialised.'
                    );
                }

                await this.Topics.add(result as UnversionedObjectResult<Topic>);
            });
            this.onNewTopicEvent.emit();
        }
    }
}
