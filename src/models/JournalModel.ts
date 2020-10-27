import {WbcMeasurement, Electrocardiogram} from '@OneCoreTypes';
import {QuestionnaireResponse} from './QuestionnaireModel';
import EventEmitter from 'events';
import {HeartEvent} from './HeartEventModel';
import {DocumentInfo} from './DocumentModel';
import {DiaryEntry} from './DiaryModel';
import {BodyTemperature} from './BodyTemperatureModel';
import {ObjectData} from './ChannelManager';
import {ConsentFile} from './ConsentFileModel';


/**
 * !!! Please use the exact class name
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
    data:
        | ObjectData<
              | WbcMeasurement
              | QuestionnaireResponse
              | DocumentInfo
              | DiaryEntry
              | ConsentFile
              | Electrocardiogram
          >
        | HeartEvent
        | BodyTemperature;
};

type JournalInput = {
    model: EventEmitter;
    retrieveFn: () => EventListEntry['data'][] | Promise<EventListEntry['data'][]>;
};

export default class JournalModel extends EventEmitter {
    private modelsDictionary: JournalInput[] = [];
    constructor(modelsInput: JournalInput[]) {
        super();
        this.modelsDictionary = modelsInput;
    }

    /**
     * maps an handler on every provided model
     * @returns {Promise<void>}
     */
    async init() {
        this.modelsDictionary
            .map((journalInput: JournalInput) => journalInput.model)
            .forEach((model: EventEmitter) => {
                model.on('updated', this.listenOnUpdatesHandler);
            });
    }

    /**
     * removes the handler for every provided model
     */
    shutdown() {
        this.modelsDictionary
            .map((journalInput: JournalInput) => journalInput.model)
            .forEach((model: EventEmitter) => {
                model.removeListener('updated', this.listenOnUpdatesHandler);
            });
    }

    /**
     * Get the stored events sorted by date. In Ascending order
     * @returns {Promise<EventListEntry[]>}
     */
    async events(): Promise<EventListEntry[]> {
        /** if there are no provided models, return empty list **/
        if (Object.keys(this.modelsDictionary).length === 0) {
            return [];
        }
        /** data structure as a dictionary **/
        const dataDictionary: {
            [event: string]: {values: EventListEntry['data'][]; index: number};
        } = {};
        /** map every provided model to the data dictionary and get their values **/
        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.model.constructor.name as EventType;
                dataDictionary[event] = {
                    values: await journalInput.retrieveFn(),
                    index: 0
                };
            })
        );
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

    private listenOnUpdatesHandler() {
        this.emit('updated');
    }
}
