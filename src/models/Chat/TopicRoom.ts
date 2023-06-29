import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {ChannelInfo} from '../../recipes/ChannelRecipes';
import type {ChatMessage as OneChatMessage, Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData, RawChannelEntry} from '../ChannelManager';
import type {Person} from '@refinio/one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {storeFileWithBlobDescriptor} from '../../misc/storeFileWithBlobDescriptor';
import BlobCollectionModel from '../BlobCollectionModel';
import type {BlobDescriptor} from '../BlobCollectionModel';
import {BlobDescriptorRecipe} from '../../recipes/BlobRecipes';
import type {BlobDescriptor as OneBlobDescriptor} from '../../recipes/BlobRecipes';
import type LeuteModel from '../Leute/LeuteModel';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';

export interface ChatMessage extends Omit<OneChatMessage, 'attachments'> {
    attachments: (BlobDescriptor | SHA256Hash)[];
}

export default class TopicRoom {
    /**
     * Notify the user whenever a new chat message is received.
     */
    public onNewMessageReceived: OEvent<() => void> = new OEvent<() => void>();

    public topic: Topic;

    /** cache the last timestamp for queried messages **/
    private dateOfLastQueriedMessage: Date | undefined = undefined;

    private channelDisconnect: (() => void) | undefined;

    private channelManager: ChannelManager;
    private leuteModel: LeuteModel;

    constructor(topic: Topic, channelManager: ChannelManager, leuteModel: LeuteModel) {
        this.topic = topic;
        this.channelManager = channelManager;
        this.leuteModel = leuteModel;

        this.onNewMessageReceived.onListen(() => {
            if (this.onNewMessageReceived.listenerCount() === 0) {
                this.channelDisconnect = this.channelManager.onUpdated(
                    this.emitNewMessageEvent.bind(this)
                );
            }
        });
        this.onNewMessageReceived.onStopListen(() => {
            if (
                this.onNewMessageReceived.listenerCount() === 0 &&
                this.channelDisconnect !== undefined
            ) {
                this.channelDisconnect();
            }
        });
    }

    /**
     * Iterator to retrieved page-sized messages.
     * @param count
     */
    async *retrieveMessagesIterator(
        count: number = 25
    ): AsyncGenerator<ObjectData<OneChatMessage>[]> {
        let collectedItems = [];

        for await (const entry of this.channelManager.objectIteratorWithType('ChatMessage', {
            channelId: this.topic.id
        })) {
            collectedItems.push(entry);
            if (collectedItems.length === count) {
                yield collectedItems;
                collectedItems = [];
            }
        }

        if (collectedItems.length > 0) {
            yield collectedItems;
        }
    }

    /**
     * Retrieve all the messages in the chat.
     */
    async retrieveAllMessages(): Promise<ObjectData<OneChatMessage>[]> {
        return await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: this.topic.id
        });
    }

    /**
     * Retrieves all chat messages and resolves the blobs, if any, so the binary data can be used.
     */
    async retrieveAllMessagesWithAttachments(): Promise<ObjectData<ChatMessage>[]> {
        const messages = await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: this.topic.id
        });
        const resolvedMessages = [];
        for (const message of messages) {
            if (message.data.attachments) {
                const resolvedAttachments = await Promise.all(
                    message.data.attachments.map(async attachmentHash => {
                        const attachmentObj = await getObject(attachmentHash);
                        if (attachmentObj.$type$ === BlobDescriptorRecipe.name) {
                            return BlobCollectionModel.resolveBlobDescriptor(
                                attachmentObj as OneBlobDescriptor
                            );
                        } else {
                            return attachmentHash;
                        }
                    })
                );
                resolvedMessages.push({
                    ...message,
                    data: {...message.data, attachments: resolvedAttachments}
                });
            } else {
                resolvedMessages.push({...message, data: {...message.data, attachments: []}});
            }
        }
        return resolvedMessages;
    }

    /**
     * Sends the message with hash data in the chat room.
     *
     * @param message
     * @param attachments array of attached hashes
     * @param author
     */
    async sendMesageWithAttachmentAsHash(
        message: string,
        attachments: SHA256Hash[],
        author?: SHA256IdHash<Person>
    ): Promise<void> {
        if (author === undefined) {
            author = await this.leuteModel.myMainIdentity();
        }

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: author,
                attachments: attachments
            },
            null,
            undefined,
            author
        );
    }

    /**
     * Sends the message with attachments in the chat room.
     * @param message
     * @param attachments array of attached files
     * @param author
     */
    async sendMessageWithAttachmentAsFile(
        message: string,
        attachments: File[],
        author?: SHA256IdHash<Person>
    ): Promise<void> {
        if (author === undefined) {
            author = await this.leuteModel.myMainIdentity();
        }

        const blobDescriptors = await Promise.all(
            attachments.map(file => storeFileWithBlobDescriptor(file))
        );
        const writtenAttachments = blobDescriptors.map(blobDescriptor => blobDescriptor.hash);

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: author,
                attachments: writtenAttachments
            },
            null,
            undefined,
            author
        );
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param author
     */
    async sendMessage(message: string, author?: SHA256IdHash<Person>): Promise<void> {
        if (author === undefined) {
            author = await this.leuteModel.myMainIdentity();
        }

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: author
            },
            null,
            undefined,
            author
        );
    }

    // --------------------------------- private ---------------------------------

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation).
     * @param channelInfoIdHash
     * @param channelId
     * @param channelOwner
     * @param timeOfEarliestChange
     * @param data
     * @private
     */
    private async emitNewMessageEvent(
        _channelInfoIdHash: SHA256IdHash<ChannelInfo>,
        channelId: string,
        _channelOwner: SHA256IdHash<Person> | null,
        timeOfEarliestChange: Date,
        _data: RawChannelEntry[]
    ) {
        if (channelId === this.topic.id) {
            this.onNewMessageReceived.emit();
        }
    }
}
