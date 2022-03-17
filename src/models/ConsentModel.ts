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

type FileStatusTuple = [File, Consent['status']];

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
    public consentState: StateMachine<
        'Uninitialised' | 'Given' | 'Revoked',
        'giveConsent' | 'revokeConsent'
    >;

    channelManager: ChannelManager;
    private disconnect: (() => void) | undefined;
    private consentsToWrite: FileStatusTuple[] = [];

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;

        this.consentState = new StateMachine<
            'Uninitialised' | 'Given' | 'Revoked',
            'giveConsent' | 'revokeConsent'
        >();
        this.consentState.addState('Given');
        this.consentState.addState('Revoked');
        this.consentState.addEvent('giveConsent');
        this.consentState.addEvent('revokeConsent');
        this.consentState.addTransition('giveConsent', 'Uninitialised', 'Given');
        this.consentState.addTransition('revokeConsent', 'Given', 'Revoked');
    }

    async init() {
        this.state.assertCurrentState('Uninitialised');

        this.consentsToWrite.every(async fileStatusTuple => {
            await this.writeConsetn(fileStatusTuple[0], fileStatusTuple[1]);
        });

        // set current consent status
        const latestChannelEntry = await this.channelManager.getObjects({
            id: ConsentModel.channelId,
            count: 1
        });

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
        if (this.state.currentState === 'Uninitialised') {
            this.consentsToWrite.push([file, status]);
        } else {
            await this.writeConsetn(file, status);
        }
    }

    private async writeConsetn(file: File, status: Consent['status']) {
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

        // signing
        const consentResult = await storeUnversionedObject(consent);
        const signedConsent = await sign(consentResult.hash);

        await this.channelManager.postToChannel(
            ConsentModel.channelId,
            signedConsent.obj,
            undefined
        );
    }
}
