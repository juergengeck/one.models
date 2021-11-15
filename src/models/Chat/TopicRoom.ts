import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {BLOB, Person} from 'one.core/lib/recipes';
import type {ChatMessage, Topic} from '../../recipes/ChatRecipes';
import type ChannelManager from '../ChannelManager';
import type {ObjectData} from '../ChannelManager';
import type {OneUnversionedObjectTypes} from 'one.core/lib/recipes';
import {OEvent} from '../../misc/OEvent';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import {
    createSingleObjectThroughPurePlan,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import type {Group} from 'one.core/lib/recipes';

export default class TopicRoom {
    // the conversation id
    public channelId: string;
    public roomName: string;
    public onNewMessage: OEvent<(message: ObjectData<ChatMessage>) => void> = new OEvent<
        (message: ObjectData<ChatMessage>) => void
    >();

    // cache the last timestamp for queried messages
    private lastQueriedChatMessageTimestamp: Date | undefined = undefined;

    private readonly channelDisconnect: (() => void) | undefined;
    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    protected channelManager: ChannelManager;

    constructor(topic: Topic, channelManager: ChannelManager) {
        this.channelId = topic.channel;
        this.roomName = topic.name !== undefined ? topic.name : 'unnamed chat';
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
    async *retrieveMessagesIterator(count: number = 25): AsyncGenerator<ObjectData<ChatMessage>> {
        for await (const entry of this.channelManager.objectIteratorWithType('ChatMessage', {
            count,
            to: this.lastQueriedChatMessageTimestamp,
            channelId: this.channelId
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
            channelId: this.channelId
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

        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'ChatMessage',
            text: message,
            sender: instanceIdHash,
            attachments: attachments
        });
    }

    /**
     * Share the given topic with the desired persons.
     * @param participants
     * @param topicHash
     */
    public async shareTopicWithPersons(
        participants: SHA256IdHash<Person>[],
        topicHash: SHA256Hash<Topic>
    ): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    object: topicHash,
                    person: participants,
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

    /**
     * Share the given topic with the desired group.
     * @param participants
     * @param topicHash
     */
    public async shareTopicWithGroup(
        participants: SHA256IdHash<Group>,
        topicHash: SHA256Hash<Topic>
    ): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    object: topicHash,
                    person: [],
                    group: [participants],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

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
        if (channelId === this.channelId) {
            this.onNewMessage.emit(data as ObjectData<ChatMessage>);
        }
    }
}
