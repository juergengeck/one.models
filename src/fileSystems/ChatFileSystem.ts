import type LeuteModel from '../models/Leute/LeuteModel';
import type {TopicModel, ChannelManager} from '../models';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';
import type {SHA256Hash} from '../../../one.core/lib/util/type-checks';
import {getObject} from '../../../one.core/lib/storage';
import {BlobCollectionModel} from '../models';
import type {OneObjectTypes} from '../../../one.core/lib/recipes';

/**
 * This file systems provides an interface to all chats.
 */
export default class ChatFileSystem extends EasyFileSystem {
    private readonly topicModel: TopicModel;
    private readonly leuteModel: LeuteModel;
    private readonly channelManager: ChannelManager;
    private readonly objectFileSystemPath: string;

    /**
     * Constructor
     *
     * @param leuteModel
     * @param topicModel
     * @param channelManager
     * @param objectFileSystemPath
     */
    constructor(
        leuteModel: LeuteModel,
        topicModel: TopicModel,
        channelManager: ChannelManager,
        objectFileSystemPath: string
    ) {
        super(true);
        this.setRootDirectory(
            new Map<string, EasyDirectoryEntry>([
                ['1to1_chats', {type: 'directory', content: this.loadOneToOneChats.bind(this)}],
                ['all_topics', {type: 'directory', content: this.loadAllTopics.bind(this)}]
            ])
        );
        this.topicModel = topicModel;
        this.leuteModel = leuteModel;
        this.channelManager = channelManager;
        this.objectFileSystemPath = objectFileSystemPath;
    }

    /**
     * Returns all one<->one chats as directory structure.
     */
    private async loadOneToOneChats(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const topics = await this.topicModel.topics.all();

        for (const topic of topics) {
            if (!this.topicModel.isOneToOneChat(topic.id)) {
                continue;
            }

            let [meHash, otherHash] = await this.topicModel.getOneToOneChatParticipantsMeFirst(
                topic.id
            );

            const myName = await this.leuteModel.getDefaultProfileDisplayName(meHash);
            const otherName = await this.leuteModel.getDefaultProfileDisplayName(otherHash);
            const chatString = `${myName}<->${otherName}`; // This way duplicates may happen

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
    private async loadAllTopics(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const topics = await this.topicModel.topics.all();

        for (const topic of topics) {
            dir.set(topic.id, {
                type: 'directory',
                content: this.loadChatMessages.bind(this, topic.id)
            });
        }

        return dir;
    }

    /**
     * Returns the content of a topic as folder with each message being a file.
     *
     * This creates a folder for each chat message. And each chat message contains a list of
     * attachments.
     *
     * There are two special folders: 'images' and 'attachments' that have all images and
     * attachments in them.
     *
     * Note: This implementation is not very good. I don't have the right mindset and calmness
     * to clean this up right now and it will change anyway soon I guess, so let's keep it like
     * that.
     *
     * @param topicId
     */
    private async loadChatMessages(topicId: string): Promise<EasyDirectoryContent> {
        const rootDir = new Map<string, EasyDirectoryEntry>();
        const attachmentsDir = new Map<string, EasyDirectoryEntry>();
        const imagesDir = new Map<string, EasyDirectoryEntry>();
        rootDir.set('images', {type: 'directory', content: imagesDir});
        rootDir.set('attachments', {type: 'directory', content: attachmentsDir});

        const room = await this.topicModel.enterTopicRoom(topicId);
        const msgs = await room.retrieveAllMessages();

        // Add authorName property to each chat message. The author name is grabbed from the
        // default profile of the person in leute.
        const messages = await Promise.all(
            msgs.map(async msg => {
                try {
                    return {
                        ...msg,
                        authorName: await this.leuteModel.getDefaultProfileDisplayName(
                            msg.data.sender
                        )
                    };
                } catch (e) {
                    return {
                        ...msg,
                        authorName: 'unknown'
                    };
                }
            })
        );

        for (const msg of messages) {
            // On the root directory: Create a folder for each message with this name:
            // "<creationtime> <authorname>: text". The content are the attachments.
            const dirname = `${msg.creationTime.toLocaleString()} ${msg.authorName}: ${
                msg.data.text
            }`;

            let attachments = msg.data.attachments
                ? [
                      ...(await Promise.all(
                          msg.data.attachments.map(attachment => this.loadAttachment(attachment))
                      ))
                  ]
                : [];

            attachments
                .filter(
                    attachment =>
                        attachment.object.$type$ === 'BlobDescriptor' &&
                        attachment.object.type.startsWith('image/')
                )
                .forEach(attachment =>
                    imagesDir.set(`${dirname} ${attachment.name}`, attachment.dirent)
                );

            attachments.forEach(attachment =>
                attachmentsDir.set(`${dirname} ${attachment.name}`, attachment.dirent)
            );

            rootDir.set(dirname, {
                type: 'directory',
                content: new Map<string, EasyDirectoryEntry>(
                    attachments.map(a => [a.name, a.dirent])
                )
            });
        }

        return rootDir;
    }

    /**
     * Load the attachments
     *
     * @param attachment
     */
    private async loadAttachment(attachment: SHA256Hash): Promise<{
        name: string;
        dirent: EasyDirectoryEntry;
        object: OneObjectTypes;
        hash: SHA256Hash;
    }> {
        const data = await getObject(attachment);

        if (data.$type$ === 'BlobDescriptor') {
            return {
                name: data.name,
                dirent: {
                    type: 'regularFile',
                    content: async () => {
                        const resolved = await BlobCollectionModel.resolveBlobDescriptor(data);
                        return new Uint8Array(resolved.data);
                    }
                },
                object: data,
                hash: attachment
            };
        } else {
            return {
                name: attachment,
                dirent: {
                    type: 'symlink',
                    content: `../../../..${this.objectFileSystemPath}/${attachment}`
                },
                object: data,
                hash: attachment
            };
        }
    }
}
