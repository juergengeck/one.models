import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type Consent from '../recipes/ConsentRecipes';
import {
    createSingleObjectThroughPurePlan,
    UnversionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../recipes/BlobRecipes';
import {StateMachine} from '../misc/StateMachine';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {sign} from '../misc/Signature';

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
    // stateMachine: StateMachine<any, any>
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    async init() {
        this.state.assertCurrentState('Uninitialised');
        this.state.triggerEvent('init');

        // check the queue
    }

    // have the current

    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }
    // private write function

    public async setConsent(file: File, status: Consent['status']) {
        // if current state != initialized push to queue
        this.state.assertCurrentState('Initialised');

        // store (after init)
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

        const result = await storeUnversionedObject(consent);
        const signedConsent = await sign(result.hash);

        /** store the consent object in one **/
        await this.channelManager.postToChannel(
            ConsentModel.channelId,
            signedConsent.obj,
            undefined
        );
    }

    // signing after init because we need the hash and the password (only after init)
}
