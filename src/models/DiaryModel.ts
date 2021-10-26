import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import type {DiaryEntry as OneDiaryEntry} from '../recipes/DiaryRecipes';
import i18nModelsInstance from '../i18n';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import {createModelStateMachine} from './Model';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {StateMachine} from '../misc/StateMachine';

/**
 * This represents the model of a diary entry
 */
export type DiaryEntry = string;

/**
 * Convert from model representation to one representation.
 *
 * @param modelObject - the model object
 * @returns The corresponding one object
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
 * @param oneObject - the one object
 * @returns The corresponding model object
 */
function convertFromOne(oneObject: OneDiaryEntry): DiaryEntry {
    // Create the new ObjectData item
    return oneObject.entry;
}

/**
 * This model implements the possibility of adding a diary entry into a journal and
 * keeping track of the list of the diary entries
 */
export default class DiaryModel implements Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    /**
     * Event emitted when diary data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();

    channelManager: ChannelManager;
    public static readonly channelId = 'diary';
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        this.channelManager = channelManager;
        this.state = createModelStateMachine();
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(DiaryModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    async addEntry(diaryEntry: DiaryEntry): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (!diaryEntry) {
            throw Error(i18nModelsInstance.t('errors:diaryModel.notEmptyField'));
        }
        await this.channelManager.postToChannel(DiaryModel.channelId, convertToOne(diaryEntry));
    }

    async entries(): Promise<ObjectData<DiaryEntry>[]> {
        this.state.assertCurrentState('Initialised');

        const objects: ObjectData<DiaryEntry>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType('DiaryEntry', {
            channelId: DiaryModel.channelId
        });

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    /**
     * returns iterator for Diary Entries
     * @param queryOptions
     */
    async *entriesIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneDiaryEntry>> {
        this.state.assertCurrentState('Initialised');

        for await (const entry of this.channelManager.objectIteratorWithType('DiaryEntry', {
            ...queryOptions,
            channelId: DiaryModel.channelId
        })) {
            yield entry;
        }
    }

    async getEntryById(id: string): Promise<ObjectData<DiaryEntry>> {
        this.state.assertCurrentState('Initialised');

        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            id,
            'DiaryEntry'
        );
        return {...restObjectData, data: convertFromOne(data)};
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     * @param owner
     * @param data
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === DiaryModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
