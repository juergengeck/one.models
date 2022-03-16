import {Model} from './Model';
import type ChannelManager from './ChannelManager';

export default class ConsentModel extends Model {
    public static readonly channelId = 'consent';

    channelManager: ChannelManager;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    shutdown(): Promise<void> {
        return Promise.resolve(undefined);
    }
}
