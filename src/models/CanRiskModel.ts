import {OEvent} from '../misc/OEvent.js';
import type ChannelManager from './ChannelManager.js';
import {Model} from './Model.js';
import type {CanRiskResult} from '../recipes/CanRiskRecipes.js';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {ChannelInfo} from '../recipes/ChannelRecipes.js';
import type {Person} from '@refinio/one.core/lib/recipes.js';
import type {ObjectData, QueryOptions, RawChannelEntry} from './ChannelManager.js';
import {getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance.js';

/**
 * Interface for the CanRisk channel.
 * Creation of channel itself happens in the API model on replicant side.
 */
export default class CanRiskModel extends Model {
    public static readonly channelId = 'CanRisk';

    // @Override base class event
    public onUpdated: OEvent<(timeOfEarliestChange: Date) => void> = new OEvent<
        (timeOfEarliestChange: Date) => void
    >();

    private channelManager: ChannelManager;
    private disconnects: (() => void)[] = [];

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    public async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');
        this.state.triggerEvent('init');

        await this.channelManager.createChannel(CanRiskModel.channelId);

        // Creation of channel happens in the API model on replicant side.
        this.disconnects.push(this.channelManager.onUpdated(this.handleOnUpdated.bind(this)));
    }

    /**
     * Shutdown this instance
     *
     * This must be done after the one instance was initialized.
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        for (const disconnect of this.disconnects) {
            disconnect();
        }
        this.disconnects = [];
        this.state.triggerEvent('shutdown');
    }

    /**
     * Get latest result for owner or undefined.
     * @param owner Optional. self personId if not provided
     * @returns
     */
    async getLatestResult(owner?: SHA256IdHash<Person>): Promise<CanRiskResult | undefined> {
        let canRiskResult: CanRiskResult | undefined = undefined;

        for await (const result of this.resultsIterator({
            owner: owner ? owner : getInstanceOwnerIdHash()
        })) {
            canRiskResult = result.data;
        }

        return canRiskResult;
    }

    /**
     * returns iterator for CanRiskResult
     * @param queryOptions
     */
    async *resultsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<CanRiskResult>> {
        this.state.assertCurrentState('Initialised');

        yield* this.channelManager.objectIteratorWithType('CanRiskResult', {
            ...queryOptions,
            channelId: CanRiskModel.channelId
        });
    }

    /**
     * Post result to channel
     * @param result json string
     * @param ownerId personId. Optional. channelManager.defaultOwner used if undefined
     */
    private async postResult(result: string, ownerId?: SHA256IdHash<Person>): Promise<void> {
        const channelOwnerId = !ownerId ? ownerId : this.channelManager.defaultOwner;
        if (!channelOwnerId) {
            throw Error('Could not determine the owner of the CanRiskResult');
        }

        const canRiskResult = {
            $type$: 'CanRiskResult',
            result: result,
            ownerIdHash: channelOwnerId
        } as const;

        const timeOfPost = new Date();

        await this.channelManager.postToChannel(
            CanRiskModel.channelId,
            canRiskResult,
            channelOwnerId
        );

        this.onUpdated.emit(timeOfPost);
    }

    //****** PRIVATE STUFF *******/

    /**
     * Handler function for the 'updated' event
     * @param _channelInfoIdHash
     * @param channelId
     * @param _channelOwner
     * @param timeOfEarliestChange
     * @param _data
     */
    private async handleOnUpdated(
        _channelInfoIdHash: SHA256IdHash<ChannelInfo>,
        channelId: string,
        _channelOwner: SHA256IdHash<Person> | null,
        timeOfEarliestChange: Date,
        _data: RawChannelEntry[]
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (channelId === CanRiskModel.channelId) {
            this.onUpdated.emit(timeOfEarliestChange);
        }
    }
}
