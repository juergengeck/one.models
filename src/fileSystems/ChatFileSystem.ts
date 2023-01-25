import type LeuteModel from '../models/Leute/LeuteModel';
import type {TopicModel, ChannelManager} from '../models';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import {getObject} from '@refinio/one.core/lib/storage';
import {BlobCollectionModel} from '../models';
import type {OneObjectTypes} from '@refinio/one.core/lib/recipes';
import type {ChatMessage} from '../recipes/ChatRecipes';
import type {ObjectData} from '../models/ChannelManager';
import {readUTF8TextFile} from '../../../one.core/lib/system/storage-base';
import {getAllEntries} from '../../../one.core/lib/reverse-map-query';

const emojiNumberMap = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '*️⃣'];

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
                [
                    '1to1_chats',
                    {type: 'directory', content: this.createOneToOneChatsFolder.bind(this)}
                ],
                ['all_topics', {type: 'directory', content: this.createAllTopicsFolder.bind(this)}]
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
    private async createOneToOneChatsFolder(): Promise<EasyDirectoryContent> {
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
                content: this.createTopicRoomFolder.bind(this, topic.id)
            });
        }

        return dir;
    }

    /**
     * Returns all topics as directory structure.
     */
    private async createAllTopicsFolder(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const topics = await this.topicModel.topics.all();

        for (const topic of topics) {
            dir.set(topic.id, {
                type: 'directory',
                content: this.createTopicRoomFolder.bind(this, topic.id)
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
    private async createTopicRoomFolder(topicId: string): Promise<EasyDirectoryContent> {
        const rootDir = new Map<string, EasyDirectoryEntry>();
        const attachmentsDir = new Map<string, EasyDirectoryEntry>();
        const imagesDir = new Map<string, EasyDirectoryEntry>();
        rootDir.set('_attachments', {
            type: 'directory',
            content: this.createAttachmentsFolder.bind(this, topicId, false)
        });
        rootDir.set('_images', {
            type: 'directory',
            content: this.createAttachmentsFolder.bind(this, topicId, true)
        });

        const room = await this.topicModel.enterTopicRoom(topicId);
        const messages = await room.retrieveAllMessages();
        const messagesWithAuthorName = await this.addAuthorToChatMessages(messages);

        for (const message of messagesWithAuthorName) {
            const attachmentCount =
                message.data.attachments === undefined ? 0 : message.data.attachments.length;
            const attachmentCountChar =
                emojiNumberMap[attachmentCount <= 10 ? attachmentCount : 11];

            // Fill the "/<chatmessage>" folder with all attachments including raw one objects
            const messageDirName = `${message.creationTime.toLocaleString()} ${attachmentCountChar} ${
                message.authorName
            }${message.data.text === '' ? '' : ': ' + message.data.text}`;
            rootDir.set(messageDirName, await this.createChatMessageFolder(message));
        }

        return rootDir;
    }

    private async createAttachmentsFolder(
        topicId: string,
        imagesOnly: boolean
    ): Promise<EasyDirectoryContent> {
        const room = await this.topicModel.enterTopicRoom(topicId);
        const messages = await room.retrieveAllMessages();
        //const messagesWithAuthorName = await this.addAuthorToChatMessages(messages);
        const messagesWithAttachments = await Promise.all(
            messages.map(async message => ({
                message,
                attachments: await this.loadAttachments(message.data.attachments, imagesOnly)
            }))
        );

        const attachmentsDir = new Map<string, EasyDirectoryEntry>();
        for (const messageWithAttachments of messagesWithAttachments) {
            const message = messageWithAttachments.message;
            for (const attachment of messageWithAttachments.attachments) {
                attachmentsDir.set(
                    `${message.creationTime.toLocaleString()} ${attachment.name}`,
                    attachment.dirent
                );
            }
        }

        return attachmentsDir;
    }

    private async createChatMessageFolder(
        message: ObjectData<ChatMessage> & {authorName: string}
    ): Promise<EasyDirectoryEntry> {
        const content = new Map<string, EasyDirectoryEntry>();

        // Add raw views
        const channelEntryHash = message.channelEntryHash;
        const channelEntryObject = await getObject(channelEntryHash);
        const channelEntryMicrodata = await readUTF8TextFile(channelEntryHash);
        const dateTimeHash = channelEntryObject.data;
        const dateTimeObject = await getObject(dateTimeHash);
        const dateTimeMicrodata = await readUTF8TextFile(dateTimeHash);
        const chatMessageHash = message.dataHash;
        const chatMessageObject = message.data;
        const chatMessageMicrodata = await readUTF8TextFile(chatMessageHash);

        content.set('message.microdata.txt', {
            type: 'regularFile',
            content: new TextEncoder().encode(chatMessageMicrodata)
        });
        content.set('message.json', {
            type: 'regularFile',
            content: new TextEncoder().encode(JSON.stringify(chatMessageObject))
        });

        // Add signatures
        content.set('signatures', {
            type: 'directory',
            content: this.loadSignatures.bind(this, [
                channelEntryHash,
                dateTimeHash,
                chatMessageHash
            ])
        });

        // Add attachments
        const attachments = await this.loadAttachments(message.data.attachments, false);
        attachments.forEach(a => content.set(a.name, a.dirent));

        return {
            type: 'directory',
            content
        };
    }

    /**
     *
     * @param attachments
     * @param imagesOnly
     */
    private async loadAttachments(
        attachments: SHA256Hash[] | undefined,
        imagesOnly: boolean
    ): Promise<
        Array<{
            name: string;
            dirent: EasyDirectoryEntry;
            object: OneObjectTypes;
            hash: SHA256Hash;
        }>
    > {
        if (attachments === undefined) {
            return [];
        }
        return Promise.all(
            attachments.map(attachment => this.loadAttachment(attachment, imagesOnly))
        );
    }

    /**
     * Load the attachments
     *
     * @param attachment
     * @param imagesOnly
     */
    private async loadAttachment(
        attachment: SHA256Hash,
        imagesOnly: boolean
    ): Promise<{
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

    private async loadSignatures(objects: SHA256Hash[]): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        for (const object of objects) {
            const certificateHashes = await getAllEntries(object, 'AffirmationCertificate');
            for (const certificateHash of certificateHashes) {
                const cert = await getObject(certificateHash);
                const signatureObjectHashes = await getAllEntries(certificateHash, 'Signature');
                const signatures = await Promise.all(
                    signatureObjectHashes.map(async signatureObjectHash => {
                        const signature = await getObject(signatureObjectHash);
                        const issuer = await this.leuteModel.getDefaultProfileDisplayName(
                            signature.issuer
                        );
                        return {
                            cert,
                            signature,
                            issuer
                        };
                    })
                );
                for (const signature of signatures) {
                    dir.set(`${signature.issuer} ${objects.findIndex(o => o === object)}`, {
                        type: 'regularFile',
                        content: JSON.stringify(signature)
                    });
                }
            }
        }
        return dir;
    }

    private async addAuthorToChatMessages(
        chatMessages: ObjectData<ChatMessage>[]
    ): Promise<Array<ObjectData<ChatMessage> & {authorName: string}>> {
        return await Promise.all(
            chatMessages.map(async msg => {
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
    }
}
