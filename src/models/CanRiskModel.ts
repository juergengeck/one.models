import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Person} from '@refinio/one.core/lib/recipes.js';

import {OEvent} from '../misc/OEvent.js';
import type ChannelManager from './ChannelManager.js';
import {Model} from './Model.js';
import type {ChannelInfo} from '../recipes/ChannelRecipes.js';
import type {ObjectData, QueryOptions, RawChannelEntry} from './ChannelManager.js';
import type {QuestionnaireResponsesHash} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes.js';
import type {
    CanRiskResultVersionsType,
    CanRiskResult
} from '../recipes/CanRiskRecipes/CanRiskResultRecipes.js';
import {
    latestVersionCanRiskResult,
    canRiskResultVersionsTypes,
    canRiskResultVersions
} from '../recipes/CanRiskRecipes/CanRiskResultRecipes.js';
import {getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance.js';

export const canRiskResultSupportedTypes = canRiskResultVersionsTypes;
export type CanRiskResultType = CanRiskResultVersionsType;

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
     * returns iterator for CanRiskResult
     * @param queryOptions
     */
    async *resultsIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<CanRiskResult>> {
        this.state.assertCurrentState('Initialised');

        yield* this.channelManager.objectIterator({
            ...queryOptions,
            channelId: CanRiskModel.channelId,
            types: canRiskResultVersions
        }) as unknown as AsyncIterableIterator<ObjectData<CanRiskResult>>;
    }

    /**
     * @param ownerId Optional. Default self personId
     * @param afterDate Optional.
     * @returns
     */
    async getLatest(
        ownerId?: SHA256IdHash<Person>,
        afterDate?: Date
    ): Promise<CanRiskResult | undefined> {
        for await (const canRiskResultObjectData of this.resultsIterator({
            from: afterDate,
            owner: ownerId ? ownerId : 'mainId'
        })) {
            return canRiskResultObjectData.data;
        }

        return undefined;
    }

    /**
     * @param questionnaireResponsesHash
     * @param ownerId Optional. Default self personId
     * @param postDate Optional.
     * @returns
     */
    async get(
        questionnaireResponsesHash: QuestionnaireResponsesHash,
        ownerId?: SHA256IdHash<Person>,
        postDate?: Date
    ): Promise<CanRiskResult | undefined> {
        for await (const canRiskResultObjectData of this.resultsIterator({
            from: postDate,
            owner: ownerId ? ownerId : 'mainId'
        })) {
            if (
                canRiskResultObjectData.data.questionnaireResponsesHash ===
                questionnaireResponsesHash
            ) {
                return canRiskResultObjectData.data;
            }
        }

        return undefined;
    }

    /**
     * @param result CanRisk api result
     * @param questionnaireResponsesHash
     * @param ownerId
     */
    async postResult(
        result: string,
        questionnaireResponsesHash: QuestionnaireResponsesHash,
        ownerId: SHA256IdHash<Person>
    ): Promise<void> {
        const canRiskResult = {
            $type$: latestVersionCanRiskResult,
            result: result,
            ownerIdHash: ownerId,
            questionnaireResponsesHash: questionnaireResponsesHash
        } as CanRiskResult;

        await this.channelManager.postToChannel(CanRiskModel.channelId, canRiskResult, ownerId);
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
