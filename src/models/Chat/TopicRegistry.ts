import {
    createSingleObjectThroughPurePlan,
    getObject,
    UnversionedObjectResult,
    VERSION_UPDATES,
    VersionedObjectResult
} from '@refinio/one.core/lib/storage';
import {getObjectByIdObj} from '@refinio/one.core/lib/storage-versioned-objects';
import type {Topic, TopicAppRegistry} from '../../recipes/ChatRecipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {ChannelInfo} from '../../recipes/ChannelRecipes';

/**
 * Registry that holds references to all the created topics
 */
export default class TopicRegistry {
    private static readonly id = 'TopicAppRegistry';

    private static instance: TopicRegistry;

    private constructor() {}

    public static async load(): Promise<TopicRegistry> {
        if (!TopicRegistry.instance) {
            TopicRegistry.instance = new TopicRegistry();
        }
        await TopicRegistry.createTopicRegistryIfNotExist();
        return TopicRegistry.instance;
    }

    /**
     * Removes the topic from the TopicRegistry
     * @param channel
     */
    public async removeTopicByChannelId(channel: SHA256IdHash<ChannelInfo>): Promise<void> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        registry.obj.topics.delete(channel);
        await this.updateTopicRegistry(registry.obj.topics);
    }

    /**
     * Creates a topic and sets it in the TopicRegistry.
     * @param topic
     */
    public async registerTopic(topic: UnversionedObjectResult<Topic>): Promise<Topic> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});

        registry.obj.topics.set(topic.obj.channel, topic.hash);
        await this.updateTopicRegistry(registry.obj.topics);
        return topic.obj;
    }

    /**
     * Retrieve topics by the given name.
     * @param name
     */
    public async retrieveTopicsByName(name: string): Promise<Topic[]> {
        const topics = await this.retrieveAllTopics();
        return topics.filter(topic => topic.name !== undefined && topic.name === name);
    }

    /**
     * Retrieve topic by the channel id.
     * @param channelId
     */
    public async retrieveTopicByChannelId(
        channelId: SHA256IdHash<ChannelInfo>
    ): Promise<Topic | undefined> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        const foundTopic = registry.obj.topics.get(channelId);

        if (foundTopic === undefined) {
            return undefined;
        }

        return await getObject(foundTopic);
    }

    /**
     * Retrieve all the topics in the TopicRegistry.
     */
    public async retrieveAllTopics(): Promise<Topic[]> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        const topicsHashes = Array.from(registry.obj.topics.values());
        return await Promise.all(
            topicsHashes.map(async topicHash => {
                return await getObject(topicHash);
            })
        );
    }

    /**
     * Creates the topic registry if not exist, otherwise returns the existing one.
     * @private
     */
    private static async createTopicRegistryIfNotExist(): Promise<
        VersionedObjectResult<TopicAppRegistry>
    > {
        try {
            return await getObjectByIdObj({$type$: 'TopicAppRegistry', id: this.id});
        } catch (e) {
            if (e.name === 'FileNotFoundError') {
                return await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    {
                        $type$: 'TopicAppRegistry',
                        id: TopicRegistry.id,
                        topics: new Map()
                    }
                );
            }

            throw e;
        }
    }

    /**
     * Updates the topic registry by the given topics.
     * @param topics
     * @private
     */
    private async updateTopicRegistry(topics: TopicAppRegistry['topics']): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'TopicAppRegistry',
                id: TopicRegistry.id,
                topics: topics
            }
        );
    }
}
