import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {BLOB, Person} from 'one.core/lib/recipes';
import type {ChatMessage} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import type LeuteModel from '../Leute/LeuteModel';
import type {OneUnversionedObjectTypes} from 'one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';

/**
 * Base chat room class that provides common functionality for other types of chat rooms
 */
export default abstract class ChatRoom {
    // participants id hashes
    public participants: SHA256IdHash<Person>[];

    // the conversation id, usually built from the participants id hashes
    public chatRoomId: string;
    public onUpdated: OEvent<(...data: any) => void> = new OEvent<(...data: any) => void>();

    // cache the last timestamp for queried messages
    private lastQueriedChatMessageTimestamp: Date | undefined = undefined;

    private channelDisconnect: (() => void) | undefined;
    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    protected channelManager: ChannelManager;
    protected leuteModel: LeuteModel;

    protected constructor(
        chatRoomId: string,
        participants: SHA256IdHash<Person>[],
        channelManager: ChannelManager,
        leuteModel: LeuteModel
    ) {
        this.participants = participants;
        this.chatRoomId = chatRoomId;
        this.channelManager = channelManager;
        this.leuteModel = leuteModel;

        this.boundOnChannelUpdated = this.onChannelUpdated.bind(this);
    }

    abstract load(): Promise<void>;

    /**
     * Creates and register listeners.
     * @protected
     */
    protected async loadBaseClass(): Promise<void> {
        await this.channelManager.createChannel(this.chatRoomId);
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
    async *retrieveMessagesIterator(count: number = 25): AsyncGenerator<ObjectData<ChatMessage>> {
        for await (const entry of this.channelManager.objectIteratorWithType('ChatMessage', {
            count,
            to: this.lastQueriedChatMessageTimestamp,
            channelId: this.chatRoomId
        })) {
            yield entry;
            this.lastQueriedChatMessageTimestamp = entry.creationTime;
        }
    }

    /**
     * Retrieve all the messages in the chat.
     */
    async retrieveAllMessages(): Promise<ObjectData<ChatMessage>[]> {
        return await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: this.chatRoomId
        });
    }

    /**
     * Sends the message in the chat room.
     * @param message
     * @param attachments
     */
    async sendMessage(message: string, attachments: SHA256Hash<BLOB>[] | undefined): Promise<void> {
        await this.channelManager.postToChannel(this.chatRoomId, {
            $type$: 'ChatMessage',
            text: message,
            sender: await (await this.leuteModel.me()).mainIdentity(),
            attachments: attachments
        });
    }

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation).
     * @param channelId
     * @param channelOwner
     * @param data
     * @private
     */
    private async onChannelUpdated(
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) {
        if (channelId === this.chatRoomId) {
            this.onUpdated.emit(data);
        }
    }
}
