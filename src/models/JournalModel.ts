import {WbcObservation, Electrocardiogram, OneUnversionedObjectTypes} from '@OneCoreTypes';
import QuestionnaireModel, {QuestionnaireResponses} from './QuestionnaireModel';
import EventEmitter from 'events';
import HeartEventModel, {HeartEvent} from './HeartEventModel';
import DocumentModel, {DocumentInfo} from './DocumentModel';
import DiaryModel, {DiaryEntry} from './DiaryModel';
import {ObjectData} from './ChannelManager';
import ConsentFileModel, {ConsentFile, DropoutFile} from './ConsentFileModel';
import BodyTemperatureModel, {BodyTemperature} from './BodyTemperatureModel';
import {OEvent} from '../misc/OEvent';
import WbcDiffModel from './WbcDiffModel';
import ECGModel from './ECGModel';

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
    data:
        | ObjectData<
              | WbcObservation
              | QuestionnaireResponses
              | DocumentInfo
              | DiaryEntry
              | ConsentFile
              | Electrocardiogram
              | DropoutFile
              | BodyTemperature
          >
        | HeartEvent;
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
    retrieveFn: () => EventListEntry['data'][] | Promise<EventListEntry['data'][]>;
    eventType: EventType;
};

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
    init() {
        this.modelsDictionary.forEach((journalInput: JournalInput) => {
            const event = journalInput.eventType;

            /*
             * @Todo this event will be removed in the future for the only use of oEvent
             */
            const handlerEventEmitter = () => {
                this.emit('updated');
            };
            const oEventHandler = (data?: ObjectData<OneUnversionedObjectTypes> | HeartEvent) => {
                this.onUpdated.emit(JournalModel.mapObjectDataToEventListEntry(data));
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
            const event = journalInput.eventType as EventType;
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
     * Get the stored events sorted by date. In Ascending order
     * @returns {Promise<EventListEntry[]>}
     */
    async events(): Promise<EventListEntry[]> {
        /** if there are no provided models, return empty list **/
        if (this.modelsDictionary.length === 0) {
            return [];
        }
        /** data structure as a dictionary **/
        const dataDictionary: {
            [event: string]: {values: EventListEntry['data'][]; index: number};
        } = {};
        /** map every provided model to the data dictionary and get their values **/
        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.eventType;
                const data = await journalInput.retrieveFn();
                dataDictionary[event] = {
                    values: data,
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

    /**
     * Maps the given object data to the corresponding event type
     * @param {ObjectData<OneUnversionedObjectTypes> | HeartEvent} objectData
     * @private
     */
    private static mapObjectDataToEventListEntry(
        objectData?: ObjectData<OneUnversionedObjectTypes> | HeartEvent
    ): EventListEntry | undefined {
        if (!objectData) {
            return undefined;
        }

        if ('creationTime' in objectData && 'heartEventType' in objectData) {
            return {type: EventType.HeartEvent, data: objectData};
        }

        if ('data' in objectData) {
            const castedObjectData = objectData as EventListEntry['data'];
            switch (objectData.data.$type$) {
                case 'ConsentFile':
                    return {type: EventType.ConsentFileEvent, data: castedObjectData};
                case 'DocumentInfo_1_1_0':
                    return {type: EventType.DocumentInfo, data: castedObjectData};
                case 'WbcObservation':
                    return {type: EventType.WbcDiffMeasurement, data: castedObjectData};
                case 'BodyTemperature':
                    return {type: EventType.BodyTemperature, data: castedObjectData};
                case 'QuestionnaireResponses':
                    return {type: EventType.QuestionnaireResponse, data: castedObjectData};
                case 'DiaryEntry':
                    return {type: EventType.DiaryEntry, data: castedObjectData};
                case 'Electrocardiogram':
                    return {type: EventType.ECGEvent, data: castedObjectData};
                case 'DocumentInfo':
                    return {type: EventType.DocumentInfo, data: castedObjectData};
            }
        }
        return undefined;
    }
}
