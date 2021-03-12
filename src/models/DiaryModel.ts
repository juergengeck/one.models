import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {DiaryEntry as OneDiaryEntry} from '@OneCoreTypes';
import i18nModelsInstance from '../i18n';
import {createEvent} from '../misc/OEvent';
import {Model} from './Model';

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
export default class DiaryModel extends EventEmitter implements Model {
    public onUpdated = createEvent<() => void>();
    channelManager: ChannelManager;
    channelId: string;
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'diary';
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    async addEntry(diaryEntry: DiaryEntry): Promise<void> {
        if (!diaryEntry) {
            throw Error(i18nModelsInstance.t('errors:diaryModel.notEmptyField'));
        }
        await this.channelManager.postToChannel(this.channelId, convertToOne(diaryEntry));
    }

    async entries(): Promise<ObjectData<DiaryEntry>[]> {
        const objects: ObjectData<DiaryEntry>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType('DiaryEntry', {
            channelId: this.channelId
        });

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    async getEntryById(id: string): Promise<ObjectData<DiaryEntry>> {
        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            id,
            'DiaryEntry'
        );
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
            this.onUpdated.emit();
        }
    }
}
