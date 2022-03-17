import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type Consent from '../recipes/ConsentRecipes';
import {
    createSingleObjectThroughPurePlan,
    UnversionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../recipes/BlobRecipes';

/**
 * This model deals with the user consent.
 *
 * The consent can be given and revoked and the object needs to be signed by the user.
 *
 * When the consent is given data is shared with a predefined entity.
 * When the consent is revoked this sharing needs to stop.
 *
 * * How to handel information of this predefined entity? get the connections model?
 * * What does the UI need
 * * Need to be able to postpone storage till one is initialized
 */
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
            fileReference: blobDescriptor.hash,
            isoStringDate: new Date().toISOString(),
            status
        };

        /** store the consent object in one **/
        await this.channelManager.postToChannel(ConsentModel.channelId, consent, undefined);
    }
}
