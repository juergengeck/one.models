import {createAccess} from '@refinio/one.core/lib/access';
import type {Group, Person} from '@refinio/one.core/lib/recipes';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage-unversioned-objects';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import {serializeWithType} from '@refinio/one.core/lib/util/promise';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {ensureIdHash} from '@refinio/one.core/lib/util/type-checks';
import {objectEvents} from '../../misc/ObjectEventDispatcher';
import {OEvent} from '../../misc/OEvent';
import type {ChannelInfo} from '../../recipes/ChannelRecipes';
import type {Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import LeuteModel from '../Leute/LeuteModel';
import {Model} from '../Model';
import TopicRegistry from './TopicRegistry';
import TopicRoom from './TopicRoom';

/**
 * Model that manages the creation of chat topics.
 */
export default class TopicModel extends Model {
    /**
     * Notify the user whenever a new topic is created or received.
     */
    public onNewTopicEvent = new OEvent<() => void>();

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
        this.disconnectFns.push(
            objectEvents.onUnversionedObject(
                this.addTopicToRegistry.bind(this),
                'TopicModel: addTopicToRegistry',
                'Topic'
            )
        );

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
        await createAccess([
            {
                id: topic.channel,
                person: participants,
                group: [],
                mode: SET_ACCESS_MODE.ADD
            }
        ]);
        await createAccess([
            {
                object: await calculateHashOfObj(topic),
                person: participants,
                group: [],
                mode: SET_ACCESS_MODE.ADD
            }
        ]);
    }

    /**
     * Share the given topic with the desired group.
     * @param groupIdHash
     * @param topic
     */
    public async addGroupToTopic(groupIdHash: SHA256IdHash<Group>, topic: Topic): Promise<void> {
        await createAccess([
            {
                id: topic.channel,
                person: [],
                group: [groupIdHash],
                mode: SET_ACCESS_MODE.ADD
            }
        ]);
        await createAccess([
            {
                object: await calculateHashOfObj(topic),
                person: [],
                group: [groupIdHash],
                mode: SET_ACCESS_MODE.ADD
            }
        ]);
    }

    // ######## Everyone chat stuff ########
    // Note that the everyone chat is just a temporary thing until we resolved some kinks in the
    // generic topics.

    public static readonly EVERYONE_TOPIC_ID = 'EveryoneTopic';
    public static readonly GLUE_TOPIC_ID = 'GlueOneTopic';

    /**
     * Creates the default everyone topic if it does not exist.
     *
     * Note: Access rights will be automatically given to the "leute everyone" group by the
     * addTopicToRegistry hook, that listens for new Topic objects.
     */
    public async createEveryoneTopic(): Promise<Topic> {
        return this.createNewTopic('Everyone', TopicModel.EVERYONE_TOPIC_ID);
    }

    /**
     * Creates the one.glue topic if it does not exist.
     *
     * Note: Access rights will be automatically given to the "leute everyone" group by the
     * addTopicToRegistry hook, that listens for new Topic objects.
     */
    public async createGlueTopic(): Promise<Topic> {
        return this.createNewTopic('glue.one', TopicModel.GLUE_TOPIC_ID);
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
     * Return whether the topicId refers to the one.glue chat or not.
     *
     * @param topicId
     */
    public isGlueChat(topicId: string): boolean {
        return topicId === TopicModel.GLUE_TOPIC_ID;
    }

    /**
     * Shares the topic and channel with the person that participate in this 1:1 chat.
     *
     * @param topic
     */
    private async applyAccessRightsIfEveryoneChat(topic: Topic): Promise<void> {
        if (!this.isEveryoneChat(topic.id) && !this.isGlueChat(topic.id)) {
            return;
        }

        const everyoneGroupModel = (await this.leuteModel.groups()).find(
            groupModel => groupModel.name === LeuteModel.EVERYONE_GROUP_NAME
        );

        if (everyoneGroupModel === undefined) {
            throw new Error('You can only create a everyone chat if leute has an everyone group.');
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
        if (this.topicRegistry === undefined) {
            throw new Error('Error while retrieving topic registry, model not initialised.');
        }

        // if no name was passed, generate a random one
        const topicName =
            desiredTopicName === undefined ? await createRandomString() : desiredTopicName;
        // generate a random channel id
        const topicID = desiredTopicID === undefined ? await createRandomString() : desiredTopicID;

        // Check if topic already exists and then return
        const foundTopic = await this.topicRegistry.queryById(topicID);

        if (foundTopic) {
            return foundTopic;
        }

        // Create the topic
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

        await this.addTopicToRegistry(savedTopic);
        return savedTopic.obj;
    }

    /**
     * This adds the topic to the registry and notifies the user of a new topic and also sets up
     * the sharing.
     *
     * @param result
     */
    private async addTopicToRegistry(result: UnversionedObjectResult<Topic>): Promise<void> {
        const topic = result.obj;

        await serializeWithType(this.TopicRegistryLOCK, async () => {
            if (this.topicRegistry === undefined) {
                throw new Error('Error while retrieving topic registry, model not initialised.');
            }

            await this.topicRegistry.add(result);
            await this.applyAccessRightsIfOneToOneChat(topic);
            await this.applyAccessRightsIfEveryoneChat(topic);
        });

        this.onNewTopicEvent.emit();
    }
}
