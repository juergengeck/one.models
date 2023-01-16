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
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import TopicRoom from './TopicRoom';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import LeuteModel from '../Leute/LeuteModel';
import {ensureIdHash} from '@refinio/one.core/lib/util/type-checks';

/**
 * Model that manages the creation of chat topics.
 */
export default class TopicModel extends Model {
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
    private readonly leuteModel: LeuteModel;
    private readonly TopicRegistryLOCK = 'ON_TOPIC_REGISTRY_OPERATION';
    private topicRegistry: TopicRegistry | undefined;
    private disconnectFns: Array<() => void> = [];

    constructor(channelManager: ChannelManager, leuteModel: LeuteModel) {
        super();
        this.channelManager = channelManager;
        this.leuteModel = leuteModel;
    }

    /**
     * Register listeners.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        this.topicRegistry = await TopicRegistry.load();
        this.disconnectFns.push(this.channelManager.onUpdated(this.onChannelUpdated.bind(this)));
        this.disconnectFns.push(onUnversionedObj.addListener(this.addTopicToRegistry.bind(this)));

        this.state.triggerEvent('init');
    }

    /**
     * De-register the listeners.
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        this.state.triggerEvent('shutdown');

        for (const disconnectFn of this.disconnectFns) {
            disconnectFn();
        }
        this.disconnectFns = [];
        this.topicRegistry = undefined;
    }

    /**
     * Retrieves the topic registry. Omit the add & remove functions from the public API. The model
     * takes care of those things.
     */
    public get topics(): Omit<TopicRegistry, 'add' | 'remove'> {
        this.state.assertCurrentState('Initialised');

        // assertCurrentState ensures that the model was initialised - so topics are not undefined
        const topicRegistry = this.topicRegistry as TopicRegistry;

        return {
            all: topicRegistry.all,
            queryById: topicRegistry.queryById,
            queryHashById: topicRegistry.queryHashById,
            queryByName: topicRegistry.queryByName
        };
    }

    /**
     * Enter the topic room by the given topic channel id.
     * @param topicID
     */
    public async enterTopicRoom(topicID: string): Promise<TopicRoom> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const foundTopic = await this.topicRegistry.queryById(topicID);

        if (foundTopic === undefined) {
            throw new Error('Error while trying to retrieve the topic. The topic does not exist.');
        }

        return new TopicRoom(foundTopic, this.channelManager, this.leuteModel);
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
                    mode: SET_ACCESS_MODE.ADD
                }
            ]
        );
    }

    // ######## Everyone chat stuff ########
    // Note that the everyone chat is just a temporary thing until we resolved some kinks in the
    // generic topics.

    public static readonly EVERYONE_TOPIC_ID = 'EveryoneTopic';

    /**
     * Creates the default everyone topic if it does not exist.
     *
     * Note: Access rights will be automatically given to the "leute everyone" group by the
     * addTopicToRegistry hook, that listens for new Topic objects.
     */
    public async createEveryoneTopic(): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        const foundTopic = await this.topicRegistry.queryById(TopicModel.EVERYONE_TOPIC_ID);

        if (foundTopic) {
            return foundTopic;
        }

        return await this.createNewTopic('Everyone', TopicModel.EVERYONE_TOPIC_ID);
    }

    /**
     * Return whether the topicId refers to the everyone chat or not.
     *
     * @param topicId
     */
    public isEveryoneChat(topicId: string): boolean {
        return topicId === TopicModel.EVERYONE_TOPIC_ID;
    }

    /**
     * Shares the topic and channel with the person that participate in this 1:1 chat.
     *
     * @param topic
     */
    private async applyAccessRightsIfEveryoneChat(topic: Topic): Promise<void> {
        if (!this.isEveryoneChat(topic.id)) {
            return;
        }

        const everyoneGroupModel = (await this.leuteModel.groups()).find(
            groupModel => groupModel.name === LeuteModel.EVERYONE_GROUP_NAME
        );

        if (everyoneGroupModel === undefined) {
            throw new Error('You can only create a eeryone chat if leute has an everyone group.');
        }

        await this.addGroupToTopic(everyoneGroupModel.groupIdHash, topic);
    }

    // ######## One To One chat stuff ########
    // Note that 1:1 chats are just a temporary thing until we resolved some kinks in the
    // generic topics.

    private static readonly oneToOneTopicRegexp = /^([0-9a-f]{64})<->([0-9a-f]{64})$/;

    /**
     * Creates one to one topic (person to person)
     *
     * Note: Access rights will be automatically given to the participants by the
     * addTopicToRegistry hook, that listens for new Topic objects.
     *
     * @param from
     * @param to
     */
    public async createOneToOneTopic(
        from: SHA256IdHash<Person>,
        to: SHA256IdHash<Person>
    ): Promise<Topic> {
        this.state.assertCurrentState('Initialised');

        const nameAndId = [from, to].sort().join('<->');
        return await this.createNewTopic(nameAndId, nameAndId);
    }

    /**
     * Return whether the topicId refers to a 1:1 chat or not.
     *
     * @param topicId
     */
    public isOneToOneChat(topicId: string): boolean {
        return TopicModel.oneToOneTopicRegexp.test(topicId);
    }

    /**
     * Get participants of a 1:1 topic.
     *
     * @param topicId
     */
    public getOneToOneChatParticipants(
        topicId: string
    ): [SHA256IdHash<Person>, SHA256IdHash<Person>] {
        const m = topicId.match(TopicModel.oneToOneTopicRegexp);

        if (m === null || m.length !== 3) {
            throw new Error('This is not a OneToOne Chat');
        }

        return [ensureIdHash<Person>(m[1]), ensureIdHash<Person>(m[2])];
    }

    /**
     * Get participants of a 1:1 topic, but return my identity first if I am a participant.
     *
     * @param topicId
     */
    public async getOneToOneChatParticipantsMeFirst(
        topicId: string
    ): Promise<[SHA256IdHash<Person>, SHA256IdHash<Person>]> {
        let [meHash, otherHash] = this.getOneToOneChatParticipants(topicId);

        const myIds = await this.leuteModel.me();

        if (myIds.identities().includes(otherHash)) {
            [meHash, otherHash] = [otherHash, meHash];
        }

        return [meHash, otherHash];
    }

    /**
     * Shares the topic and channel with the person that participate in this 1:1 chat.
     *
     * @param topic
     */
    private async applyAccessRightsIfOneToOneChat(topic: Topic): Promise<void> {
        if (!this.isOneToOneChat(topic.id)) {
            return;
        }
        const participants = this.getOneToOneChatParticipants(topic.id);
        await this.addPersonsToTopic(participants, topic);
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

        console.log('TOPIC CREATION', savedTopic.hash, savedTopic.obj, savedTopic.status);

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
     * This adds the topic to the registry and notifies the user of a new topic and also sets up
     * the sharing.
     *
     * @param result
     */
    private async addTopicToRegistry(result: UnversionedObjectResult): Promise<void> {
        const topic = result.obj;

        if (result.status !== 'new') {
            return;
        }

        if (topic.$type$ !== 'Topic') {
            return;
        }

        await serializeWithType(this.TopicRegistryLOCK, async () => {
            if (this.topicRegistry === undefined) {
                throw new Error('Error while retrieving topic registry, model not initialised.');
            }

            await this.topicRegistry.add(result as UnversionedObjectResult<Topic>);
            await this.applyAccessRightsIfOneToOneChat(topic);
            try {
                await this.applyAccessRightsIfEveryoneChat(topic);
            } catch (e) {
                // This might happen if leute was not created with an everyone group
                console.error(e);
            }
        });
        this.onNewTopicEvent.emit();
    }
}
