import i18nModelsInstance from '../i18n';
import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import type {BodyTemperature as OneBodyTemperature} from '../recipes/BodyTemperatureRecipe';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';

/**
 * This represents the model of a body temperature measurement
 */
// @TODO the Omit thingy doesn't work as expected... the $type$ property it's still accessible from the outside
export interface BodyTemperature extends Omit<OneBodyTemperature, '$type$'> {}

/**
 * This model implements the possibility of adding a body temperature measurement into a journal and
 * keeping track of the list of the body temperature measurements
 */
export default class BodyTemperatureModel  implements Model {
    /**
     * Event is emitted when body temperature data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();
    public static readonly channelId = 'bodyTemperature';

    channelManager: ChannelManager;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(BodyTemperatureModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Used to store a body temperature in one instance.
     * @param bodyTemperature - the body temperature measurement provided by the user.
     * @param creationTimestamp - the time in milliseconds when the body temperature was measured.
     */
    async addBodyTemperature(bodyTemperature: number, creationTimestamp?: number): Promise<void> {
        /** make sure that the supplied body temperature fit the allowed range **/
        if (bodyTemperature < 35 || bodyTemperature > 45) {
            throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.entryError'));
        }

        /** store the body temperature in one **/
        await this.channelManager.postToChannel(
            BodyTemperatureModel.channelId,
            {$type$: 'BodyTemperature', temperature: bodyTemperature},
            undefined,
            creationTimestamp
        );
    }

    /**
     * Used to retrieve the body temperatures.
     * Depending on the provided params all the body temperatures are retrieved
     * or just the body temperatures that fit the query parameters.
     * @returns the body temperatures.
     * @param queryParams - used to filter the returned data.
     */
    async getBodyTemperatures(queryParams?: QueryOptions): Promise<ObjectData<BodyTemperature>[]> {
        /** if the channel id is not specified override it **/
        if (queryParams) {
            if (!queryParams.channelId) {
                queryParams.channelId = BodyTemperatureModel.channelId;
            }
        } else {
            queryParams = {channelId: BodyTemperatureModel.channelId};
        }

        /** get all the body temperatures from one that fit the query parameters **/
        return await this.channelManager.getObjectsWithType('BodyTemperature', queryParams);
    }

    /**
     * returns iterator for BodyTemperature
     * @param queryOptions
     */
    async *bodyTemperaturesIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneBodyTemperature>> {
        yield* this.channelManager.objectIteratorWithType('BodyTemperature', {
            ...queryOptions,
            channelId: BodyTemperatureModel.channelId
        });
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     * @param owner
     * @param data
     */
    private async handleChannelUpdate(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === BodyTemperatureModel.channelId) {

            this.onUpdated.emit(data);
        }
    }
}
