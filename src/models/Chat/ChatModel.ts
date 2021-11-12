import {Model} from '../Model';
import type LeuteModel from '../Leute/LeuteModel';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Group, Person} from 'one.core/lib/recipes';
import type {PersonImage} from '../../recipes/Leute/PersonDescriptions';
import type ChannelManager from '../ChannelManager';
import type {ChatMessage} from '../../recipes/ChatRecipes';
import type {OneUnversionedObjectTypes} from 'one.core/lib/recipes';
import type {ObjectData} from '../ChannelManager';
import GroupModel from '../Leute/GroupModel';
import type ChatRoom from './ChatRoom';
import GroupChatRoom from './GroupChatRoom';
import DirectChatRoom from './DirectChatRoom';
import {getObjectByIdHash} from 'one.core/lib/storage';

export type WrappedChatRoom = {
    // the conversation id
    id: string;
    with: SHA256IdHash<Person | Group>;
};

export type UnwrappedChatRoom = {
    id: string;
    with: SHA256IdHash<Person | Group>;
    conversationName: string;
    image?: PersonImage;
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
    private readonly boundOnProfileUpdated: () => Promise<void>;

    constructor(leuteModel: LeuteModel, channelManager: ChannelManager) {
        super();
        this.leuteModel = leuteModel;
        this.channelManager = channelManager;
        this.boundOnChannelUpdated = this.onChannelUpdated.bind(this);
        this.boundOnProfileUpdated = this.onProfileUpdated.bind(this);
    }

    /**
     * Register listeners.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        this.channelDisconnect = this.channelManager.onUpdated(this.boundOnChannelUpdated);
        this.profileDisconnect = this.leuteModel.onProfileUpdate(this.boundOnProfileUpdated);
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
    async retrieveChatRoomContainers(): Promise<WrappedChatRoom[]> {
        this.state.assertCurrentState('Initialised');

        const groupConversations = await this.retrieveGroupChatRoomsContainers();
        const directConversations = await this.retrieveDirectChatRoomsContainers();

        return directConversations.concat(groupConversations);
    }

    /**
     * Enter a chat room. A chat room object will be created.
     * @param wrappedChatRoom
     */
    async enterChatRoom(wrappedChatRoom: WrappedChatRoom): Promise<ChatRoom> {
        this.state.assertCurrentState('Initialised');
        const withObj = await getObjectByIdHash(wrappedChatRoom.with);
        if (withObj.obj.$type$ === 'Group') {
            const groupModel = await GroupModel.constructFromLatestProfileVersion(
                wrappedChatRoom.with as SHA256IdHash<Group>
            );
            return new GroupChatRoom(
                wrappedChatRoom.id,
                this.channelManager,
                this.leuteModel,
                groupModel
            );
        }

        if (withObj.obj.$type$ === 'Person') {
            return new DirectChatRoom(
                wrappedChatRoom.id,
                [wrappedChatRoom.with as SHA256IdHash<Person>],
                this.channelManager,
                this.leuteModel
            );
        }

        throw new Error('The given object in wrappedChatRoom.with is not a Group, nor a Person.');
    }

    /**
     * Retrieves conversations you can have with groups of people.
     * @private
     */
    public async retrieveGroupChatRoomsContainers(): Promise<WrappedChatRoom[]> {
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

                const channelConversationId = [
                    mePersonId,
                    ...groupModel.persons,
                    groupModel.groupIdHash
                ]
                    .sort()
                    .join('#');

                return {
                    id: channelConversationId,
                    with: groupModel.groupIdHash
                };
            })
        );
    }

    /**
     * Retrieves the conversations you can have with only one person.
     * @private
     */
    public async retrieveDirectChatRoomsContainers(): Promise<WrappedChatRoom[]> {
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
                    with: profile.personId
                };
            })
        );
    }

    /**
     * Un wraps the chat room = give more details
     * @param wrappedChatRoom
     */
    public async unwrapChatRoom(wrappedChatRoom: WrappedChatRoom): Promise<UnwrappedChatRoom> {
        const withObj = await getObjectByIdHash(wrappedChatRoom.with);
        if (withObj.obj.$type$ === 'Group') {
            const groupModel = await GroupModel.constructFromLatestProfileVersion(
                wrappedChatRoom.with as SHA256IdHash<Group>
            );

            return {
                id: wrappedChatRoom.id,
                with: wrappedChatRoom.with,
                conversationName: groupModel.name,
                latestConversation: await this.findLastMessageOfChatRoomByChatRoomID(
                    wrappedChatRoom.id
                )
            };
        }

        if (withObj.obj.$type$ === 'Person') {
            const profile = await this.leuteModel.getMainProfile(
                wrappedChatRoom.with as SHA256IdHash<Person>
            );

            return {
                id: wrappedChatRoom.id,
                with: wrappedChatRoom.with,
                conversationName: profile.descriptionsOfType('PersonName')[0].name,
                latestConversation: await this.findLastMessageOfChatRoomByChatRoomID(
                    wrappedChatRoom.id
                ),
                image: profile.getImage()
            };
        }

        throw new Error('The given object in wrappedChatRoom.with is not a Group, nor a Person.');
    }

    /**
     * Retrieve the last conversation you had by the given Conversation ID.
     * @param chatRoomId
     * @private
     */
    private async findLastMessageOfChatRoomByChatRoomID(
        chatRoomId: string
    ): Promise<UnwrappedChatRoom['latestConversation'] | undefined> {
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

    /**
     * Notify the client to update the conversation list (there might be a profile change)
     * @private
     */
    private async onProfileUpdated() {
        this.onUpdated.emit();
    }
}
