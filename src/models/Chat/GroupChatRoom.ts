import type GroupModel from '../Leute/GroupModel';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';
import type ChannelManager from '../ChannelManager';
import type LeuteModel from '../Leute/LeuteModel';
import {
    createSingleObjectThroughPurePlan,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import ChatRoom from './ChatRoom';

/**
 * This class extends the {@link ChatRoom} functionality by giving access rights to the chat room &
 * having the group model in it.
 */
export default class GroupChatRoom extends ChatRoom {
    private groupModel: GroupModel;

    constructor(
        chatRoomId: string,
        channelManager: ChannelManager,
        leuteModel: LeuteModel,
        groupModel: GroupModel
    ) {
        super(chatRoomId, groupModel.persons, channelManager, leuteModel);
        this.groupModel = groupModel;
    }

    /**
     * Loads the base class and the latest version of the group model. Gives access to the chat
     * room.
     */
    async load() {
        await this.loadBaseClass();
        await this.groupModel.loadLatestVersion();
        this.participants = this.groupModel.persons;
        await this.giveGroupChatAccess();
    }

    private async giveGroupChatAccess() {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    id: await calculateIdHashOfObj({
                        $type$: 'ChannelInfo',
                        id: this.chatRoomId,
                        owner: await (await this.leuteModel.me()).mainIdentity()
                    }),
                    person: this.participants,
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
}
