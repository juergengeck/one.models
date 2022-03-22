import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type {Consent} from '../recipes/ConsentRecipes';
import {
    createSingleObjectThroughPurePlan,
    getObjectWithType,
    UnversionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {BlobDescriptor} from '../recipes/BlobRecipes';
import {StateMachine} from '../misc/StateMachine';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {sign} from '../misc/Signature';
import {writeFile} from '../misc/writeFile';

type FileStatusTuple = [File, Consent['status']];

/**
 * This model deals with the user consent.
 *
 * The consent can be given and revoked and the object needs to be signed by the user.
 *
 * When the consent is given data is shared with a predefined entity.
 * When the consent is revoked this sharing needs to stop.
 *
 * The application needs to take care of the previous tasks.
 * Therefore it can:
 *  * Check the public `consentState` to see the current consent state
 *  * Listen and filter on ConsentModel.consentState
 *      .onEnterState(state => {if (state == 'Revoked'){ do ...}})
 *    to stop sharing if it is received.
 *
 */
export default class ConsentModel extends Model {
    public static readonly channelId = 'consent';
    public consentState: StateMachine<
        'Uninitialised' | 'Given' | 'Revoked',
        'giveConsent' | 'revokeConsent' | 'shutdown'
    >;

    private consentsToWrite: FileStatusTuple[] = [];
    private channelManager: ChannelManager | undefined;

    constructor() {
        super();
        this.consentState = new StateMachine<
            'Uninitialised' | 'Given' | 'Revoked',
            'giveConsent' | 'revokeConsent' | 'shutdown'
        >();

        this.consentState.addState('Uninitialised');
        this.consentState.addState('Given');
        this.consentState.addState('Revoked');
        this.consentState.addEvent('giveConsent');
        this.consentState.addEvent('revokeConsent');
        this.consentState.addEvent('shutdown');
        this.consentState.addTransition('giveConsent', 'Uninitialised', 'Given');
        this.consentState.addTransition('revokeConsent', 'Given', 'Revoked');
        // not needed for ARTEMIS but generally makes sense
        this.consentState.addTransition('revokeConsent', 'Uninitialised', 'Revoked');
        this.consentState.addTransition('shutdown', 'Given', 'Uninitialised');
        this.consentState.addTransition('shutdown', 'Revoked', 'Uninitialised');

        this.consentState.setInitialState('Uninitialised');
    }

    /**
     * The init function is only called after ONE is initialized
     *
     * It updates the state from storage if no consent changes where queued.
     * Else it writes the queue to storage
     * @param channelManager
     */
    public async init(channelManager: ChannelManager) {
        this.state.assertCurrentState('Uninitialised');
        this.channelManager = channelManager;

        await this.channelManager.createChannel(ConsentModel.channelId);

        // update state from storage if no queued consents are present
        if (this.consentsToWrite.length == 0) {
            const latestChannelEntry = await this.channelManager.getObjects({
                channelId: ConsentModel.channelId,
                count: 1
            });

            const signature = await getObjectWithType(latestChannelEntry[0].dataHash, 'Signature');
            const consent = await getObjectWithType(signature.data, 'Consent');

            this.setState(consent.status);
        } else {
            // write all queued consents
            for (const fileStatusTuple of this.consentsToWrite) {
                const [file, status] = fileStatusTuple;
                await this.writeConsent(file, status);
            }

            // cleanup the queue
            this.consentsToWrite = [];
        }

        this.state.triggerEvent('init');
    }

    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        // after init the queue and all new consents are written to the storage so we don't need
        // to check here for unwritten consents

        this.state.triggerEvent('shutdown');
        this.consentState.triggerEvent('shutdown');
    }

    public async setConsent(file: File, status: Consent['status']) {
        if (this.state.currentState === 'Uninitialised') {
            this.consentsToWrite.push([file, status]);
        } else {
            await this.writeConsent(file, status);
        }
        this.setState(status);
    }

    /**
     * Do the state transition
     * @param status
     * @private
     */
    private setState(status: Consent['status']) {
        if (status == 'given') {
            this.consentState.triggerEvent('giveConsent');
        }
        if (status == 'revoked') {
            this.consentState.triggerEvent('revokeConsent');
        }
    }

    private async writeConsent(file: File, status: Consent['status']) {
        const blobDescriptor = await writeFile(file);

        const consent: Consent = {
            $type$: 'Consent',
            fileReference: blobDescriptor.hash,
            isoStringDate: new Date().toISOString(),
            status
        };

        // signing
        const consentResult = await storeUnversionedObject(consent);
        const signedConsent = await sign(consentResult.hash);

        // @ts-ignore writeConsent is only called after the channelManger is set
        await this.channelManager.postToChannel(
            ConsentModel.channelId,
            signedConsent.obj,
            undefined
        );
    }
}
