import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type Consent from '../recipes/ConsentRecipes';

export default class ConsentModel extends Model {
    public static readonly channelId = 'consent';

    channelManager: ChannelManager;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    async init() {
        this.state.assertCurrentState('Uninitialised');
        this.state.triggerEvent('init');
    }

    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    public async addConsent(file: File) {
        this.state.assertCurrentState('Initialised');
        const consent: Consent = {
            $type$: 'Consent',
            file: file,
            isoStringDate: Date,
            status: undefined
        };

        /** store the consent object in one **/
        await this.channelManager.postToChannel(ConsentModel.channelId, consent, undefined);
    }
}
