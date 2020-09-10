import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {DiaryEntry as OneDiaryEntry} from '@OneCoreTypes';
import i18nModelsInstance from '../i18n';

/**
 * This represents the model of a diary entry
 */
export type DiaryEntry = string;

/**
 * Convert from model representation to one representation.
 *
 * @param {DiaryEntry} modelObject - the model object
 * @returns {OneDiaryEntry} The corresponding one object
 */
function convertToOne(modelObject: DiaryEntry): OneDiaryEntry {
    // Create the resulting object
    return {
        $type$: 'DiaryEntry',
        entry: modelObject
    };
}

/**
 * Convert from one representation to model representation.
 *
 * @param {OneDiaryEntry} oneObject - the one object
 * @returns {DiaryEntry} The corresponding model object
 */
function convertFromOne(oneObject: OneDiaryEntry): DiaryEntry {
    // Create the new ObjectData item
    return oneObject.entry;
}

/**
 * This model implements the possibility of adding a diary entry into a journal and
 * keeping track of the list of the diary entries
 */
export default class DiaryModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'diary';
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    async addEntry(diaryEntry: DiaryEntry): Promise<void> {
        if (!diaryEntry) {
            throw Error(i18nModelsInstance.t('errors:diaryModel.notEmptyField'));
        }
        await this.channelManager.postToChannel(this.channelId, convertToOne(diaryEntry));
    }

    async entries(): Promise<ObjectData<DiaryEntry>[]> {
        const objects: ObjectData<DiaryEntry>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'DiaryEntry'
        );

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    async getEntryById(id: string): Promise<ObjectData<DiaryEntry>> {
        const {data, ...restObjectData} = (
            await this.channelManager.getObjectWithTypeById(this.channelId, id, 'DiaryEntry')
        )[0];
        return {...restObjectData, data: convertFromOne(data)};
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
