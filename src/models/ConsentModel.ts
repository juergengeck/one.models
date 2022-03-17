import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type Consent from '../recipes/ConsentRecipes';
import {
    createSingleObjectThroughPurePlan,
    UnversionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../recipes/BlobRecipes';

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

    public async setConsent(file: File, status: Consent['status']) {
        this.state.assertCurrentState('Initialised');

        const blobDescriptor = (await createSingleObjectThroughPurePlan(
            {module: '@module/writeFile'},
            file
        )) as UnversionedObjectResult<BlobDescriptor>;

        const consent: Consent = {
            $type$: 'Consent',
            file: blobDescriptor.obj,
            isoStringDate: new Date().toISOString(),
            status
        };

        /** store the consent object in one **/
        await this.channelManager.postToChannel(ConsentModel.channelId, consent, undefined);
    }
}
