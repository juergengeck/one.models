import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {ChatMessage as OneChatMessage, Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {storeFileWithBlobDescriptor} from '../../misc/storeFileWithBlobDescriptor';
import {getObject} from '@refinio/one.core/lib/storage';
import BlobCollectionModel from '../BlobCollectionModel';
import type {BlobDescriptor} from '../BlobCollectionModel';
import type {BlobDescriptor as OneBlobDescriptor} from '../../recipes/BlobRecipes';
import type LeuteModel from '../Leute/LeuteModel';

export interface ChatMessage extends Omit<OneChatMessage, 'attachments'> {
    attachments: BlobDescriptor[] | SHA256Hash[];
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
    private leuteModel: LeuteModel;

    constructor(topic: Topic, channelManager: ChannelManager, leuteModel: LeuteModel) {
        this.topic = topic;
        this.channelManager = channelManager;
        this.leuteModel = leuteModel;

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
                if (message.data.attachments[0].type.$type$ === 'BlobDescriptor') {
                    const blobDescriptors = await Promise.all(
                        message.data.attachments.map(blobDescriptorHash =>
                            getObject(blobDescriptorHash)
                        )
                    );
                    const resolvedBlobDescriptors: BlobDescriptor[] = await Promise.all(
                        blobDescriptors.map(blobDescriptor =>
                            BlobCollectionModel.resolveBlobDescriptor(
                                blobDescriptor as OneBlobDescriptor
                            )
                        )
                    );

                    resolvedMessages.push({
                        ...message,
                        data: {...message.data, attachments: resolvedBlobDescriptors}
                    });
                } else {
                    resolvedMessages.push({
                        ...message,
                        data: {...message.data, attachments: message.data.attachments}
                    });
                }
            } else {
                resolvedMessages.push({...message, data: {...message.data, attachments: []}});
            }
        }
        return resolvedMessages;
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param attachments
     */
    async sendMessageHashes(
        message: string,
        attachments?: SHA256Hash[] | undefined
    ): Promise<void> {
        const instanceIdHash = getInstanceOwnerIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('Error: instance id hash could not be found');
        }

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: instanceIdHash,
                attachments: attachments
            },
            null
        );
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param attachments
     */
    async sendAttachmentMessage(message: string, attachments: File[]): Promise<void> {
        const instanceIdHash = getInstanceOwnerIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('Error: instance id hash could not be found');
        }
        let writtenAttachments: SHA256Hash<OneBlobDescriptor>[] = [];

        const blobDescriptors = await Promise.all(
            attachments.map(file => storeFileWithBlobDescriptor(file))
        );
        writtenAttachments = blobDescriptors.map(blobDescriptor => blobDescriptor.hash);

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: await this.leuteModel.myMainIdentity(),
                attachments: writtenAttachments
            },
            null
        );
    }

    /**
     * Sends the message in the chat room.
     * @param message
     */
    async sendMessage(message: string): Promise<void> {
        const instanceIdHash = getInstanceOwnerIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('Error: instance id hash could not be found');
        }

        await this.channelManager.postToChannel(
            this.topic.id,
            {
                $type$: 'ChatMessage',
                text: message,
                sender: instanceIdHash
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
