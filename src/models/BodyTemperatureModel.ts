import EventEmitter from 'events';
import i18nModelsInstance from '../i18n';
import ChannelManager from './ChannelManager';
import {BodyTemperature as OneBodyTemperature} from '@OneCoreTypes';

/**
 * This represents the model of a body temperature measurement
 */
export type BodyTemperature = {
    date: Date;
    temperature: number;
};

function convertToOneBodyTemperature(bodyTemperature: BodyTemperature): OneBodyTemperature {
    if (bodyTemperature.temperature > 47) {
        throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.entryError'));
    }

    return {
        $type$: 'BodyTemperature',
        temperature: bodyTemperature.temperature
    };
}

/**
 * This model implements the possibility of adding a body temperature measurement into a journal and
 * keeping track of the list of the body temperature measurements
 */
export default class BodyTemperatureModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.channelId = 'bodyTemperature';
    }

    async addBodyTemperature(bodyTemperature: BodyTemperature): Promise<void> {
        if (!bodyTemperature.temperature) {
            throw Error(i18nModelsInstance.t('errors:bodyTemperatureModel.notEmptyField'));
        }

        await this.channelManager.postToChannel(
            this.channelId,
            convertToOneBodyTemperature(bodyTemperature)
        );

        this.emit('updated');
    }

    async getBodyTemperatures(): Promise<BodyTemperature[]> {
        const objects: BodyTemperature[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType('BodyTemperature', {
            channelId: this.channelId
        });

        for (const obj of oneObjects) {
            objects.push({temperature: obj.data.temperature, date: new Date(obj.creationTime)});
        }

        return objects;
    }

    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }
}
