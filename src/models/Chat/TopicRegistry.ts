import {
    createSingleObjectThroughPurePlan,
    getIdObject,
    getObject,
    UnversionedObjectResult,
    VERSION_UPDATES,
    VersionedObjectResult
} from '@refinio/one.core/lib/storage';
import {getObjectByIdObj} from '@refinio/one.core/lib/storage-versioned-objects';
import type {Topic, TopicAppRegistry} from '../../recipes/ChatRecipes';
import type {ChannelInfo} from '../../recipes/ChannelRecipes';

/**
 * Registry that holds references to all the created topics.
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
     * Removes the topic from the TopicRegistry by the given topicID.
     * @param topicID
     */
    public async remove(topicID: string): Promise<void> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        registry.obj.topics.delete(topicID);
        await TopicRegistry.updateTopicRegistry(registry.obj.topics);
    }

    /**
     * Registers the given topic into the TopicRegistry.
     * @param topic
     */
    public async add(topic: UnversionedObjectResult<Topic>): Promise<Topic> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});

        const channel = await getIdObject<'ChannelInfo'>(topic.obj.channel);
        registry.obj.topics.set(channel.id, topic.hash);
        await TopicRegistry.updateTopicRegistry(registry.obj.topics);
        return topic.obj;
    }

    /**
     * Retrieve all the topics in the TopicRegistry.
     */
    public async all(): Promise<Topic[]> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        const topicsHashes = Array.from(registry.obj.topics.values());
        return await Promise.all(
            topicsHashes.map(async topicHash => {
                return await getObject(topicHash);
            })
        );
    }

    /**
     * Retrieve topics by the given name.
     * @param name
     */
    public async queryByName(name: string): Promise<Topic[]> {
        const topics = await this.all();
        return topics.filter(topic => topic.name !== undefined && topic.name === name);
    }

    /**
     * Retrieve topic by the channel id.
     * @param topicID
     */
    public async queryById(topicID: string): Promise<Topic | undefined> {
        const registry = await getObjectByIdObj({$type$: 'TopicAppRegistry', id: TopicRegistry.id});
        const foundTopic = registry.obj.topics.get(topicID);

        if (foundTopic === undefined) {
            return undefined;
        }

        return await getObject(foundTopic);
    }

    // --------------------------------- private ---------------------------------

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
    private static async updateTopicRegistry(topics: TopicAppRegistry['topics']): Promise<void> {
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
