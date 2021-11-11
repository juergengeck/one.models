import {Model} from '../Model';
import type LeuteModel from '../Leute/LeuteModel';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';
import type {PersonImage} from '../../recipes/Leute/PersonDescriptions';
import type ChannelManager from '../ChannelManager';
import type {ChatMessage} from '../../recipes/ChatRecipes';
import type {OneUnversionedObjectTypes} from 'one.core/lib/recipes';
import type {ObjectData} from '../ChannelManager';
import GroupModel from '../Leute/GroupModel';
import type ChatRoom from './ChatRoom';
import GroupChatRoom from './GroupChatRoom';
import DirectChatRoom from './DirectChatRoom';

export type ChatRoomContainer = {
    // the conversation id
    id: string;
    // name of the conversation participants without yours
    otherParticipantsNames: string;
    // all the participants ids
    participantsIds: SHA256IdHash<Person>[];
    // if the given chat room is a group chat room
    groupName?: string;
    // image of the chat room
    image?: PersonImage;
    // the last message of the conversation with date
    latestConversation?: {
        text: string;
        date: Date;
    };
};

/**
 * Chat Model class that takes care of chat managing:
 *  - list chat rooms
 *  - creates chat rooms
 *  - listens on changes
 */
export default class ChatModel extends Model {
    private readonly leuteModel: LeuteModel;
    private readonly channelManager: ChannelManager;

    private channelDisconnect: (() => void) | undefined;
    private profileDisconnect: (() => void) | undefined;

    private readonly boundOnChannelUpdated: (
        channelId: string,
        channelOwner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ) => Promise<void>;

    constructor(leuteModel: LeuteModel, channelManager: ChannelManager) {
        super();
        this.leuteModel = leuteModel;
        this.channelManager = channelManager;
        this.boundOnChannelUpdated = this.onChannelUpdated.bind(this);
    }

    /**
     * Register listeners.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        this.channelDisconnect = this.channelManager.onUpdated(this.boundOnChannelUpdated);
        this.profileDisconnect = this.leuteModel.onProfileUpdate(this.onUpdated.emit);
        this.state.triggerEvent('init');
    }

    /**
     * De-register the listeners.
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.channelDisconnect !== undefined) {
            this.channelDisconnect();
        }

        if (this.profileDisconnect !== undefined) {
            this.profileDisconnect();
        }

        this.state.triggerEvent('shutdown');
    }

    /**
     * Retrieves all the conversations (direct + groups)
     */
    async retrieveChatRoomContainers(): Promise<ChatRoomContainer[]> {
        this.state.assertCurrentState('Initialised');

        const groupConversations = await this.retrieveGroupChatRoomsContainers();
        const directConversations = await this.retrieveDirectChatRoomsContainers();

        return directConversations.concat(groupConversations);
    }

    /**
     * Enter a chat room. A chat room object will be created.
     * @param chatRoomContainer
     */
    async enterChatRoom(chatRoomContainer: ChatRoomContainer): Promise<ChatRoom> {
        this.state.assertCurrentState('Initialised');

        const {participantsIds, groupName} = chatRoomContainer;
        if (groupName !== undefined) {
            const groupModel = await GroupModel.constructFromLoadedVersionByName(groupName);

            return new GroupChatRoom(groupModel, this.channelManager, this.leuteModel);
        }

        return new DirectChatRoom(participantsIds, this.channelManager, this.leuteModel);
    }

    /**
     * Creates a new Chat Room. If no chatRoomName is provided, a default one is going to be created
     * in the createGroup function.
     * @param participants
     * @param chatRoomName
     */
    async createChatRoom(
        participants: SHA256IdHash<Person>[],
        chatRoomName?: string
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const groupdModel = await this.leuteModel.createGroup(chatRoomName);
        groupdModel.persons = participants;
        await groupdModel.saveAndLoad();
        this.onUpdated.emit();
    }

    /**
     * Retrieves conversations you can have with groups of people.
     * @private
     */
    private async retrieveGroupChatRoomsContainers(): Promise<ChatRoomContainer[]> {
        const groupsModel = await this.leuteModel.groups();

        const mePersonId = await (await this.leuteModel.me()).mainIdentity();

        return await Promise.all(
            groupsModel.map(async groupModel => {
                const personIds = [mePersonId, ...groupModel.persons].sort();

                const names = await Promise.all(
                    groupModel.persons.map(async personId => {
                        const profile = await this.leuteModel.getMainProfile(personId);
                        return profile.descriptionsOfType('PersonName')[0].name;
                    })
                );

                const channelConversationId = personIds.join('<->');
                return {
                    id: channelConversationId,
                    otherParticipantsNames: names.join(','),
                    participantsIds: personIds,
                    groupName: groupModel.name,
                    lastestConversation: await this.findLastMessageOfChatRoomByChatRoomID(
                        channelConversationId
                    )
                };
            })
        );
    }

    /**
     * Retrieves the conversations you can have with only one person.
     * @private
     */
    private async retrieveDirectChatRoomsContainers(): Promise<ChatRoomContainer[]> {
        const others = await this.leuteModel.others();
        const profiles = (
            await Promise.all(
                others.map(async someone => {
                    return await someone.profiles();
                })
            )
        ).flat(1);

        const mePersonId = await (await this.leuteModel.me()).mainIdentity();

        return await Promise.all(
            profiles.map(async profile => {
                const participantsIds = [mePersonId, profile.personId].sort();
                const chatRoomId = `${participantsIds.join('<->')}`;
                return {
                    id: chatRoomId,
                    otherParticipantsNames: profile.descriptionsOfType('PersonName')[0].name,
                    participantsIds: participantsIds,
                    image: profile.getImage(),
                    lastestConversation: await this.findLastMessageOfChatRoomByChatRoomID(
                        chatRoomId
                    )
                };
            })
        );
    }

    /**
     * Retrieve the last conversation you had by the given Conversation ID.
     * @param chatRoomId
     * @private
     */
    private async findLastMessageOfChatRoomByChatRoomID(
        chatRoomId: string
    ): Promise<ChatRoomContainer['latestConversation'] | undefined> {
        const foundEntries = await this.channelManager.getObjectsWithType('ChatMessage', {
            channelId: chatRoomId,
            count: 1
        });
        if (foundEntries.length > 0) {
            const lastEntry = foundEntries[0];
            return {
                date: lastEntry.creationTime,
                text: lastEntry.data.text
            };
        } else {
            return undefined;
        }
    }

    /**
     * Notify the client to update the conversation list (there might be a new last message for
     * a conversation)
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
        if (data.data.$type$ === 'ChatMessage') {
            this.onUpdated.emit();
        }
    }
}
