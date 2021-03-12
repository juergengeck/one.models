import EventEmitter from 'events';
import i18nModelsInstance from '../i18n';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {BodyTemperature as OneBodyTemperature} from '@OneCoreTypes';
import {createEvent} from '../misc/OEvent';
import {Model} from './Model';

/**
 * This represents the model of a body temperature measurement
 */
// @TODO the Omit thingy doesn't work as expected... the $type$ property it's still accessible from the outside
export interface BodyTemperature extends Omit<OneBodyTemperature, '$type$'> {}

/**
 * This model implements the possibility of adding a body temperature measurement into a journal and
 * keeping track of the list of the body temperature measurements
 */
export default class BodyTemperatureModel extends EventEmitter implements Model {
    public onUpdated = createEvent<() => void>();

    channelManager: ChannelManager;
    channelId: string;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.channelId = 'bodyTemperature';
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
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
     * @param {number} bodyTemperature - the body temperature measurement provided by the user.
     * @param {} creationTimestamp - the time in milliseconds when the body temperature was measured.
     * @returns {Promise<void>}
     */
    async addBodyTemperature(bodyTemperature: number, creationTimestamp?: number): Promise<void> {
        /** make sure that the supplied body temperature fit the allowed range **/
        if (bodyTemperature < 35 || bodyTemperature > 45) {
            throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.entryError'));
        }

        /** store the body temperature in one **/
        await this.channelManager.postToChannel(
            this.channelId,
            {$type$: 'BodyTemperature', temperature: bodyTemperature},
            undefined,
            creationTimestamp
        );
    }

    /**
     * Used to retrieve the body temperatures.
     * Depending on the provided params all the body temperatures are retrieved
     * or just the body temperatures that fit the query parameters.
     * @returns {Promise<ObjectData<BodyTemperature>[]>} - the body temperatures.
     * @param queryParams - used to filter the returned data.
     */
    async getBodyTemperatures(queryParams?: QueryOptions): Promise<ObjectData<BodyTemperature>[]> {
        /** if the channel id is not specified override it **/
        if (queryParams) {
            if (!queryParams.channelId) {
                queryParams.channelId = this.channelId;
            }
        } else {
            queryParams = {channelId: this.channelId};
        }

        /** get all the body temperatures from one that fit the query parameters **/
        return await this.channelManager.getObjectsWithType('BodyTemperature', queryParams);
    }

    /**
     *  Handler function for the 'updated' event
     *  @param {string} id
     * @return {Promise<void>}
     */
    private async handleChannelUpdate(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit();
        }
    }
}
