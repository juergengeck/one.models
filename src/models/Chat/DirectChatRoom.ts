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

export default class DirectChatRoom extends ChatRoom {
    constructor(
        participants: SHA256IdHash<Person>[],
        channelManager: ChannelManager,
        leuteModel: LeuteModel
    ) {
        super(participants, channelManager, leuteModel);
    }

    async load() {
        await this.loadBaseClass();
        await this.giveDirectChatAccess();
    }

    private async giveDirectChatAccess() {
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    id: await calculateIdHashOfObj({
                        $type$: 'ChannelInfo',
                        id: this.conversationId,
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
