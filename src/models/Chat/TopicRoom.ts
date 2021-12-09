import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {BLOB, Person} from '@refinio/one.core/lib/recipes';
import type {ChatMessage, Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';

export default class TopicRoom {
    /**
     * Notify the user whenever a new chat message is received.
     */
    public onNewMessageReceived: OEvent<(message: ObjectData<ChatMessage>) => void> = new OEvent<
        (message: ObjectData<ChatMessage>) => void
    >();

    public topic: Topic;

    /** cache the last timestamp for queried messages **/
    private dateOfLastQueriedMessage: Date | undefined = undefined;

    private readonly channelDisconnect: (() => void) | undefined;

    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    private channelManager: ChannelManager;

    constructor(topic: Topic, channelManager: ChannelManager) {
        this.topic = topic;
        this.channelManager = channelManager;

        this.boundOnChannelUpdated = this.emitNewMessageEvent.bind(this);
        this.channelDisconnect = this.channelManager.onUpdated(this.boundOnChannelUpdated);
    }

    /**
     * De-register listeners.
     */
    async exit(): Promise<void> {
        if (this.channelDisconnect !== undefined) {
            this.channelDisconnect();
        }
    }

    /**
     * Iterator to retrieved page-sized messages.
     * @param count
     */
    async *retrieveMessagesIterator(count: number = 25): AsyncGenerator<ObjectData<ChatMessage>[]> {
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
    async retrieveAllMessages(): Promise<ObjectData<ChatMessage>[]> {
        return await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: this.topic.id
        });
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param attachments
     */
    async sendMessage(message: string, attachments: SHA256Hash<BLOB>[] | undefined): Promise<void> {
        const instanceIdHash = await getInstanceOwnerIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('Error: instance id hash could not be found');
        }

        await this.channelManager.postToChannel(this.topic.id, {
            $type$: 'ChatMessage',
            text: message,
            sender: instanceIdHash,
            attachments: attachments
        });
    }

    // --------------------------------- private ---------------------------------

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation).
     * @param channelId
     * @param channelOwner
     * @param data
     * @private
     */
    private async emitNewMessageEvent(
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) {
        if (channelId === this.topic.id) {
            this.onNewMessageReceived.emit(data as ObjectData<ChatMessage>);
        }
    }
}
