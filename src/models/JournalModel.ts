/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {WbcObservation} from '../recipes/WbcDiffRecipes';
import type {QuestionnaireResponses} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes';
import type {DocumentInfo_1_1_0} from '../recipes/DocumentRecipes/DocumentRecipes_1_1_0';
import type {DiaryEntry} from '../recipes/DiaryRecipes';
import type {ConsentFile} from '../recipes/ConsentFileRecipes';
import type {Electrocardiogram} from '../recipes/ECGRecipes';
import type {BodyTemperature} from '../recipes/BodyTemperatureRecipe';
import type {HeartEvent} from '../recipes/HeartEventRecipes';
import type HeartEventModel from './HeartEventModel';
import type WbcDiffModel from './WbcDiffModel';
import type QuestionnaireModel from './QuestionnaireModel';
import type DocumentModel from './DocumentModel';
import type DiaryModel from './DiaryModel';
import type ConsentFileModel from './ConsentFileModel';
import type ECGModel from './ECGModel';
import type BodyTemperatureModel from './BodyTemperatureModel';
import type {OneUnversionedObjectTypes} from 'one.core/lib/recipes';

/**
 * !!! Add the corresponding model class name here
 */
export enum EventType {
    QuestionnaireResponse = 'QuestionnaireModel',
    WbcDiffMeasurement = 'WbcDiffModel',
    HeartEvent = 'HeartEventModel',
    DocumentInfo = 'DocumentModel',
    DiaryEntry = 'DiaryModel',
    BodyTemperature = 'BodyTemperatureModel',
    ConsentFileEvent = 'ConsentFileModel',
    ECGEvent = 'ECGModel'
}

/**
 * Add the corresponding type here
 */
export type EventListEntry = {
    type: EventType;
    data: ObjectData<
        | WbcObservation
        | QuestionnaireResponses
        | DocumentInfo_1_1_0
        | DiaryEntry
        | ConsentFile
        | Electrocardiogram
        | BodyTemperature
        | HeartEvent
    >;
};

type JournalInput = {
    model:
        | HeartEventModel
        | WbcDiffModel
        | QuestionnaireModel
        | DocumentModel
        | DiaryModel
        | ConsentFileModel
        | ECGModel
        | BodyTemperatureModel;
    retrieveFn: (
        queryOptions?: QueryOptions
    ) => AsyncIterableIterator<EventListEntry['data'] | Promise<EventListEntry['data']>>;
    eventType: EventType;
};

type TimeFrame = {from: Date; to: Date};

type JournalData = {[event: string]: {values: EventListEntry['data'][]; index: number}};

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export default class JournalModel extends EventEmitter {
    private modelsDictionary: JournalInput[] = [];

    private eventEmitterListeners: Map<EventType, () => void> = new Map();
    private oEventListeners: Map<
        EventType,
        {
            disconnect: (() => void) | undefined;
            listener: (data?: ObjectData<OneUnversionedObjectTypes>) => void;
        }
    > = new Map();

    public onUpdated = new OEvent<(data?: EventListEntry) => void>();

    constructor(modelsInput: JournalInput[]) {
        super();
        this.modelsDictionary = modelsInput;
    }

    /**
     * maps an handler on every provided model
     * @returns {Promise<void>}
     */
    async init() {
        this.modelsDictionary.forEach((journalInput: JournalInput) => {
            const event = journalInput.eventType;
            /*
             * @Todo this event will be removed in the future for the only use of oEvent
             */
            const handlerEventEmitter = () => {
                this.emit('updated');
            };
            const oEventHandler = (data?: ObjectData<OneUnversionedObjectTypes>) => {
                /** It's guaranteed that incoming objects are "data" of {@link EventListEntry} because of the {@link JournalInput} **/
                this.onUpdated.emit(
                    JournalModel.mapObjectDataToEventListEntry(data as EventListEntry['data'])
                );
            };
            journalInput.model.on('updated', handlerEventEmitter);
            const disconnectFn = journalInput.model.onUpdated(oEventHandler.bind(this));
            /** persist the function reference in a map **/
            this.eventEmitterListeners.set(event, handlerEventEmitter);
            this.oEventListeners.set(event, {listener: oEventHandler, disconnect: disconnectFn});
        });
    }

    /**
     * removes the handler for every provided model
     */
    shutdown() {
        this.modelsDictionary.forEach((journalInput: JournalInput) => {
            const event = journalInput.eventType;
            /** retrieve the function reference in order to delete it **/
            const eventEmitterHandler = this.eventEmitterListeners.get(event);
            const oEventHandler = this.oEventListeners.get(event);

            if (oEventHandler && oEventHandler.disconnect) {
                oEventHandler.disconnect();
            }

            if (eventEmitterHandler) {
                journalInput.model.removeListener('updated', eventEmitterHandler);
            }
        });
    }

    /**
     * Get the latest day stored events sorted by date. In Ascending order
     */
    async retrieveLatestDayEvents(): Promise<EventListEntry[]> {
        /** if there are no provided models, return empty list **/
        if (this.modelsDictionary.length === 0) {
            return [];
        }
        /** data structure as a dictionary **/
        const dataDictionary: JournalData = {};

        const latestTo = new Date(await this.findLatestTimeFrame());
        const latestFrom = new Date(latestTo.valueOf() === 0 ? 0 : latestTo.valueOf() - ONE_DAY_MS);
        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.eventType;
                const data: EventListEntry['data'][] = [];
                for await (const retrievedData of journalInput.retrieveFn({
                    to: latestTo,
                    from: latestFrom
                })) {
                    data.push(retrievedData as unknown as EventListEntry['data']);
                }
                dataDictionary[event] = {
                    values: data,
                    index: 0
                };
            })
        );
        return this.createEventList(dataDictionary);
    }

    /**
     * Generator function that gets the next day stored events sorted by date. In Ascending order
     */
    async *retrieveEventsByDayIterator(
        pageSize: number = 25
    ): AsyncIterableIterator<EventListEntry[]> {
        /**
         * Find the highest timestamp and set the currentTimeFrame to it.
         * The "from" field will be one day behind the "to" field.
         */
        const to = new Date(await this.findLatestTimeFrame());
        const from = new Date(to.valueOf() === 0 ? 0 : to.valueOf() - ONE_DAY_MS);
        let currentTimeFrame: TimeFrame = {from, to};

        /** if there are no provided models **/
        if (this.modelsDictionary.length === 0) {
            return;
        }

        let counter = 0;
        let dataDictionary: JournalData = {};

        /** Start iterating **/
        for (;;) {
            /** if the current time frame reached time '0' **/
            if (currentTimeFrame.from.getTime() === 0 && currentTimeFrame.to.getTime() === 0) {
                /** Yield the remaining values from the dictionary if it got to the end and the dictionary still have values inside **/
                if (Array.from(Object.keys(dataDictionary)).length !== 0) {
                    yield this.createEventList(dataDictionary);
                }
                /** break free :) **/
                break;
            }

            for (const model of this.modelsDictionary) {
                const event = model.eventType;
                for await (const retrievedData of model.retrieveFn({
                    to: currentTimeFrame.to,
                    from: currentTimeFrame.from
                })) {
                    /** if the pageSize condition is met **/
                    if (pageSize === counter) {
                        const eventListEntries = this.createEventList(dataDictionary);
                        yield eventListEntries;
                        /** clear counter and dictionary **/
                        dataDictionary = {};
                        counter = 0;
                    }

                    /** same issue as in {@link this.findLatestTimeFrame} **/
                    const data = retrievedData as EventListEntry['data'];

                    /** If the event exists in the dictionary and if the array exists,
                     *  create a new array with the new value and the rest of the array
                     **/
                    if (dataDictionary[event] && dataDictionary[event].values.length) {
                        dataDictionary[event] = {
                            values: [...dataDictionary[event].values, data],
                            index: 0
                        };
                    } else {
                        dataDictionary[event] = {
                            values: [data],
                            index: 0
                        };
                    }

                    counter++;
                }
            }

            /**
             * Move the TimeFrame to find the next latestTo Date.
             * Start "from" 0 to the previous "from" and update the
             * currentTimeFrame with the found Values.
             */
            const nextTo = new Date(
                await this.findLatestTimeFrame(new Date(0), currentTimeFrame.from)
            );
            const nextFrom = new Date(nextTo.valueOf() === 0 ? 0 : nextTo.valueOf() - ONE_DAY_MS);
            currentTimeFrame = {
                from: nextFrom,
                to: nextTo
            };
        }
    }

    /**
     * Get the stored events sorted by date. In Ascending order
     * @returns {Promise<EventListEntry[]>}
     */
    async retrieveAllEvents(): Promise<EventListEntry[]> {
        /** if there are no provided models, return empty list **/
        if (this.modelsDictionary.length === 0) {
            return [];
        }
        /** data structure as a dictionary **/
        const dataDictionary: JournalData = {};
        /** map every provided model to the data dictionary and get their values **/
        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.eventType;
                const data: EventListEntry['data'][] = [];
                for await (const retrievedData of journalInput.retrieveFn()) {
                    data.push(retrievedData as unknown as EventListEntry['data']);
                }
                dataDictionary[event] = {
                    values: data,
                    index: 0
                };
            })
        );
        return this.createEventList(dataDictionary);
    }

    /**
     * This function will create & sort in ascending order the event list.
     * @param {JournalData} dataDictionary
     * @private
     */
    private createEventList(dataDictionary: JournalData): EventListEntry[] {
        /** get the total length of data values **/
        const totalLen: number = Object.keys(dataDictionary)
            .map((event: string) => dataDictionary[event].values.length)
            .reduce((acc: number, cur: number) => acc + cur);

        const eventList: EventListEntry[] = [];

        for (let i = 0; i < totalLen; ++i) {
            const compareElements: EventListEntry[] = [];
            /** for every key of the data dictionary **/
            for (const event of Object.keys(dataDictionary)) {
                /** get the actual object **/
                const eventData = dataDictionary[event];
                /** check the index if it has values left **/
                if (eventData.index < eventData.values.length) {
                    compareElements.push({
                        /** put the data key as the event type, also = model class name **/
                        type: event as EventType,
                        data: eventData.values[eventData.index]
                    });
                }
            }
            /** This checks if the number of loop iterations are all right. It should always be ok unless there is
             * a programming error in this algorithm
             **/
            if (compareElements.length === 0) {
                throw new Error(
                    'Programming error: Not enough compare elements in input lists. This should never happen!'
                );
            }
            /** Lets find the element with the newest date **/
            let oldestElement: EventListEntry = compareElements[0];

            for (const compareElement of compareElements) {
                if (compareElement.data.creationTime < oldestElement.data.creationTime) {
                    oldestElement = compareElement;
                }
            }

            /** increment the added item. OldestElement.type is the actual key of the object **/
            dataDictionary[oldestElement.type].index++;
            eventList.push(oldestElement);
        }

        /** Now all elements should be sorted in the list => return it **/
        return eventList;
    }

    /**
     * This function queries the channels and finds the newest creation time
     * @param {Date} from
     * @param {Date} to
     * @private
     */
    private async findLatestTimeFrame(from?: Date, to?: Date): Promise<number> {
        const timestamps = await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                let data: EventListEntry['data'] | null = null;
                for await (const retrievedData of journalInput.retrieveFn({
                    count: 1,
                    to: to,
                    from: from
                })) {
                    /** The return type of provided functions will always be EventListEntry['data'].
                     *  I don't know the reason why TS does not recognise the return type of the retrieve function.
                     **/
                    data = retrievedData as EventListEntry['data'];
                }
                if (data !== null) {
                    return data.creationTime.getTime();
                }
                return 0;
            })
        );
        return Math.max(...timestamps);
    }

    /**
     * Maps the given object data to the corresponding event type
     * @param {ObjectData<OneUnversionedObjectTypes>} objectData
     * @private
     */
    private static mapObjectDataToEventListEntry(
        objectData?: EventListEntry['data']
    ): EventListEntry | undefined {
        if (!objectData) {
            return undefined;
        }

        switch (objectData.data.$type$) {
            case 'ConsentFile':
                return {type: EventType.ConsentFileEvent, data: objectData};
            case 'DocumentInfo_1_1_0':
                return {type: EventType.DocumentInfo, data: objectData};
            case 'WbcObservation':
                return {type: EventType.WbcDiffMeasurement, data: objectData};
            case 'BodyTemperature':
                return {type: EventType.BodyTemperature, data: objectData};
            case 'QuestionnaireResponses':
                return {type: EventType.QuestionnaireResponse, data: objectData};
            case 'DiaryEntry':
                return {type: EventType.DiaryEntry, data: objectData};
            case 'Electrocardiogram':
                return {type: EventType.ECGEvent, data: objectData};
            case 'HeartEvent':
                return {type: EventType.HeartEvent, data: objectData};
        }
        return undefined;
    }
}
