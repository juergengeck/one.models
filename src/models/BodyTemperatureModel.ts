import EventEmitter from 'events';
import i18nModelsInstance from '../i18n';
import ChannelManager from './ChannelManager';

/**
 * This represents the model of a body temperature measurement
 */
export type BodyTemperature = {
    creationTime: Date;
    temperature: number;
};

/**
 * This model implements the possibility of adding a body temperature measurement into a journal and
 * keeping track of the list of the body temperature measurements
 */
export default class BodyTemperatureModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.channelId = 'bodyTemperature';
        this.boundOnUpdatedHandler = this.handleChannelUpdate.bind(this);
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Used to store a body temperature in one instance.
     * @param {number} bodyTemperature - the body temperature measurement provided by the user.
     * @returns {Promise<void>}
     */
    async addBodyTemperature(bodyTemperature: number): Promise<void> {
        /** check if the body temperature was supplied **/
        if (bodyTemperature === undefined || bodyTemperature === null) {
            throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.notEmptyField'));
        }

        /** make sure that the supplied body temperature fit the allowed range **/
        if (bodyTemperature < 35 || bodyTemperature > 45) {
            throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.entryError'));
        }

        /** store the body temperature in one **/
        await this.channelManager.postToChannel(
            this.channelId,
            {$type$: 'BodyTemperature', temperature: bodyTemperature},
            undefined,
            Date.now()
        );
    }

    async getBodyTemperatures(): Promise<BodyTemperature[]> {
        const objects: BodyTemperature[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType('BodyTemperature', {
            channelId: this.channelId
        });

        for (const obj of oneObjects) {
            objects.push({temperature: obj.data.temperature, creationTime: obj.creationTime});
        }

        return objects;
    }

    /**
     *  Handler function for the 'updated' event
     *  @param {string} id
     * @return {Promise<void>}
     */
    private async handleChannelUpdate(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
