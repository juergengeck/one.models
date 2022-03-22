import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {ChatMessage as OneChatMessage, Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';
import {storeFileWithBlobDescriptor} from '../../misc/storeFileWithBlobDescriptor';
import {getObject} from '@refinio/one.core/lib/storage';
import BlobCollectionModel from '../BlobCollectionModel';
import type {BlobDescriptor} from '../BlobCollectionModel';
import type {BlobDescriptor as OneBlobDescriptor} from '../../recipes/BlobRecipes';

export interface ChatMessage extends Omit<OneChatMessage, 'attachments'> {
    attachments: File[];
}

export default class TopicRoom {
    /**
     * Notify the user whenever a new chat message is received.
     */
    public onNewMessageReceived: OEvent<(message: ObjectData<OneChatMessage>) => void> = new OEvent<
        (message: ObjectData<OneChatMessage>) => void
    >();

    public topic: Topic;

    /** cache the last timestamp for queried messages **/
    private dateOfLastQueriedMessage: Date | undefined = undefined;

    private channelDisconnect: (() => void) | undefined;

    private readonly boundOnChannelUpdated: (
        channelId: string,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    private channelManager: ChannelManager;

    constructor(topic: Topic, channelManager: ChannelManager) {
        this.topic = topic;
        this.channelManager = channelManager;

        this.boundOnChannelUpdated = this.emitNewMessageEvent.bind(this);

        this.onNewMessageReceived.onListen(() => {
            if (this.onNewMessageReceived.listenerCount() === 0) {
                this.channelDisconnect = this.channelManager.onUpdated(this.boundOnChannelUpdated);
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

    async retrieveAllMessagesWithAttachmentsAsFiles(): Promise<
        ObjectData<ChatMessage | OneChatMessage>[]
    > {
        const messages = await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: this.topic.id
        });
        const resolvedMessages = [];
        for (const message of messages) {
            if (message.data.attachments) {
                const blobDescriptors = await Promise.all(
                    message.data.attachments.map(blobDescriptorHash =>
                        getObject(blobDescriptorHash)
                    )
                );
                const resolvedBlobDescriptors: BlobDescriptor[] = await Promise.all(
                    blobDescriptors.map(blobDescriptor =>
                        BlobCollectionModel.resolveBlobDescriptor(blobDescriptor)
                    )
                );

                const resolvedFiles: File[] = resolvedBlobDescriptors.map(blobDescriptor => {
                    // @ts-ignore additional params
                    const file: File = {
                        lastModified: blobDescriptor.lastModified,
                        name: blobDescriptor.name,
                        size: blobDescriptor.size,
                        type: blobDescriptor.type,
                        arrayBuffer: () => new Promise(() => blobDescriptor.data)
                    };
                    return file;
                });

                resolvedMessages.push({
                    ...message,
                    data: {...message.data, attachments: resolvedFiles}
                });
            } else {
                resolvedMessages.push(message);
            }
        }
        return resolvedMessages;
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param attachments
     */
    async sendMessage(message: string, attachments?: File[] | undefined): Promise<void> {
        const instanceIdHash = await getInstanceOwnerIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('Error: instance id hash could not be found');
        }
        let writtenAttachments: SHA256Hash<OneBlobDescriptor>[] = [];

        if (attachments) {
            const blobDescriptors = await Promise.all(
                attachments.map(file => storeFileWithBlobDescriptor(file))
            );
            writtenAttachments = blobDescriptors.map(blobDescriptor => blobDescriptor.hash);
        }

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: instanceIdHash,
                attachments: writtenAttachments
            },
            null
        );
    }

    // --------------------------------- private ---------------------------------

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation).
     * @param channelId
     * @param data
     * @private
     */
    private async emitNewMessageEvent(
        channelId: string,
        data: ObjectData<OneUnversionedObjectTypes>
    ) {
        if (channelId === this.topic.id) {
            this.onNewMessageReceived.emit(data as ObjectData<OneChatMessage>);
        }
    }
}
