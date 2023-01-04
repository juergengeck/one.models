import type LeuteModel from '../models/Leute/LeuteModel';
import type {TopicModel, ChannelManager} from '../models';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';
import {ensureIdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';

/**
 * This file systems provides an interface to all chats.
 */
export default class ChatFileSystem extends EasyFileSystem {
    private readonly topicModel: TopicModel;
    private readonly leuteModel: LeuteModel;
    private readonly channelManager: ChannelManager;

    /**
     * Constructor
     *
     * @param leuteModel
     * @param topicModel
     * @param channelManager
     */
    constructor(leuteModel: LeuteModel, topicModel: TopicModel, channelManager: ChannelManager) {
        super(true);
        this.setRootDirectory(
            new Map<string, EasyDirectoryEntry>([
                ['1on1_chats', {type: 'directory', content: this.loadOneOnOneChats.bind(this)}],
                ['all_topics', {type: 'directory', content: this.loadAllTopics.bind(this)}]
            ])
        );
        this.topicModel = topicModel;
        this.leuteModel = leuteModel;
        this.channelManager = channelManager;
    }

    /**
     * Returns all one<->one chats as directory structure.
     */
    async loadOneOnOneChats(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const topics = await this.topicModel.topics.all();

        for (const topic of topics) {
            const m = topic.id.match(/([0-9a-f]{64})<->([0-9a-f]{64})/);

            if (m === null || m.length !== 3) {
                continue;
            }

            const person1 = ensureIdHash<Person>(m[1]);
            const person2 = ensureIdHash<Person>(m[2]);

            const myIds = await this.leuteModel.me();
            let meHash;
            let otherHash;

            if (myIds.identities().includes(person1)) {
                meHash = person1;
                otherHash = person2;
            } else {
                meHash = person2;
                otherHash = person1;
            }

            const me = await this.leuteModel.getDefaultProfileDisplayName(meHash);
            const other = await this.leuteModel.getDefaultProfileDisplayName(otherHash);
            const chatString = `${me}<->${other}`; // This way duplicates may happen

            if (dir.has(chatString)) {
                continue;
            }

            dir.set(chatString, {
                type: 'directory',
                content: this.loadChatMessages.bind(this, topic.id)
            });
        }

        return dir;
    }

    /**
     * Returns all topics as directory structure.
     */
    async loadAllTopics(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const topics = await this.topicModel.topics.all();

        for (const topic of topics) {
            dir.set(topic.id, {
                type: 'directory',
                content: this.loadChatMessages.bind(this, topic.id)
            });
            // const m = topic.id.match(/([0-9a-e]{64})<->([0-9a-e]{64})/);
        }

        return dir;
    }

    /**
     * Returns the content of a topic as folder with each message beign a file.
     *
     * @param topicId
     */
    async loadChatMessages(topicId: string): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const room = await this.topicModel.enterTopicRoom(topicId);
        const msgs = await room.retrieveAllMessages();
        const messages = await Promise.all(
            msgs.map(async msg => {
                try {
                    const author = await this.leuteModel.getDefaultProfileDisplayName(
                        msg.data.sender
                    );
                    return `${msg.creationTime.toLocaleString()} ${author}: ${msg.data.text}`;
                } catch (e) {
                    return `unknown: ${msg.data.text}`;
                }
            })
        );

        for (const message of messages) {
            dir.set(message, {type: 'regularFile', content: message});
        }

        return dir;
    }
}
