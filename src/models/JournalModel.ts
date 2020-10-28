import WbcDiffModel from './WbcDiffModel';
import {WbcMeasurement, Electrocardiogram} from '@OneCoreTypes';
import QuestionnaireModel, {QuestionnaireResponse} from './QuestionnaireModel';
import EventEmitter from 'events';
import HeartEventModel, {HeartEvent} from './HeartEventModel';
import DocumentModel, {DocumentInfo} from './DocumentModel';
import DiaryModel, {DiaryEntry} from './DiaryModel';
import BodyTemperatureModel, {BodyTemperature} from './BodyTemperatureModel';
import {ObjectData} from './ChannelManager';
import ConsentFileModel, {ConsentFile} from './ConsentFileModel';
import {ECGModel} from './index';

export enum EventType {
    QuestionnaireResponse,
    WbcDiffMeasurement,
    HeartEvent,
    DocumentInfo,
    DiaryEntry,
    BodyTemperature,
    ConsentFileEvent,
    ECGEvent
}

export type EventListEntry = {
    type: EventType;
    data:
        | ObjectData<WbcMeasurement>
        | ObjectData<QuestionnaireResponse>
        | HeartEvent
        | ObjectData<DocumentInfo>
        | ObjectData<DiaryEntry>
        | BodyTemperature
        | ObjectData<ConsentFile>
        | ObjectData<Electrocardiogram>;
};

export default class JournalModel extends EventEmitter {
    constructor(
        wbcDiffModel: WbcDiffModel,
        questionnaireModel: QuestionnaireModel,
        heartEventModel: HeartEventModel,
        documentModel: DocumentModel,
        diaryModel: DiaryModel,
        bodyTemperatureModel: BodyTemperatureModel,
        consentFileModel: ConsentFileModel,
        ecgModel: ECGModel
    ) {
        super();
        this.wbcDiffModel = wbcDiffModel;
        this.questionnaireModel = questionnaireModel;
        this.heartEventModel = heartEventModel;
        this.documentModel = documentModel;
        this.diaryModel = diaryModel;
        this.bodyTemperatureModel = bodyTemperatureModel;
        this.consentFileModel = consentFileModel;
        this.ecgModel = ecgModel;
        // Connect events
        wbcDiffModel.on('updated', () => {
            this.emit('updated');
        });
        questionnaireModel.on('updated', () => {
            this.emit('updated');
        });
        heartEventModel.on('updated', () => {
            this.emit('updated');
        });
        documentModel.on('updated', () => {
            this.emit('updated');
        });
        diaryModel.on('updated', () => {
            this.emit('updated');
        });
        bodyTemperatureModel.on('updated', () => {
            this.emit('updated');
        });
        consentFileModel.on('updated', () => {
            this.emit('updated');
        });
        ecgModel.on('updated', () => {
            this.emit('updated');
        });
    }

    /**
     * Get the stored events sorted by date.
     *
     * In Ascending order! (TODO: add a switch for that)
     */
    async events(): Promise<EventListEntry[]> {
        const diaryEntries = await this.diaryModel.entries();
        const measurements = await this.wbcDiffModel.measurements();
        const qresponses = await this.questionnaireModel.responses();
        const heartEvents = await this.heartEventModel.heartEvents();
        const documents = await this.documentModel.documents();
        const temperatures = await this.bodyTemperatureModel.getBodyTemperatures();
        const consentFiles = await this.consentFileModel.entries();
        const ecgs = await this.ecgModel.retrieveAll();
        const eventList: EventListEntry[] = [];

        let measurementsIndex = 0;
        let qresponsesIndex = 0;
        let heartEventsIndex = 0;
        let documentsIndex = 0;
        let diaryEntriesIndex = 0;
        let temperatureIndex = 0;
        let consentFileIndex = 0;
        let ecgIndex = 0;
        for (
            let i = 0;
            i <
            measurements.length +
            qresponses.length +
            heartEvents.length +
            documents.length +
            diaryEntries.length +
            temperatures.length +
            consentFiles.length +
            ecgs.length;
            ++i
        ) {
            const compareElements: EventListEntry[] = [];

            // Load the remaining latest elements from all lists
            if (measurementsIndex < measurements.length) {
                compareElements.push({
                    type: EventType.WbcDiffMeasurement,
                    data: measurements[measurementsIndex]
                });
            }

            if (qresponsesIndex < qresponses.length) {
                compareElements.push({
                    type: EventType.QuestionnaireResponse,
                    data: qresponses[qresponsesIndex]
                });
            }

            if (heartEventsIndex < heartEvents.length) {
                compareElements.push({
                    type: EventType.HeartEvent,
                    data: heartEvents[heartEventsIndex]
                });
            }

            if (documentsIndex < documents.length) {
                compareElements.push({
                    type: EventType.DocumentInfo,
                    data: documents[documentsIndex]
                });
            }

            if (diaryEntriesIndex < diaryEntries.length) {
                compareElements.push({
                    type: EventType.DiaryEntry,
                    data: diaryEntries[diaryEntriesIndex]
                });
            }

            if (temperatureIndex < temperatures.length) {
                compareElements.push({
                    type: EventType.BodyTemperature,
                    data: temperatures[temperatureIndex]
                });
            }

            if (consentFileIndex < consentFiles.length) {
                compareElements.push({
                    type: EventType.ConsentFileEvent,
                    data: consentFiles[consentFileIndex]
                });
            }
            if (ecgIndex < ecgs.length) {
                compareElements.push({
                    type: EventType.ECGEvent,
                    data: ecgs[ecgIndex]
                });
            }
            // This checks if the number of loop iterations is ok. It should always be ok unless there is
            // a programming error in this algorithm
            if (compareElements.length === 0) {
                throw new Error(
                    'Programming error: Not enough compare elements in input lists. This should never happen!'
                );
            }

            // Lets find the element with the newest date
            let oldestElement: EventListEntry = compareElements[0];

            for (const compareElement of compareElements) {
                if (compareElement.data.creationTime < oldestElement.data.creationTime) {
                    oldestElement = compareElement;
                }
            }

            // Now that we have the newest element let's just append it and advance the
            // correct index and append the chosen element to the output array
            switch (oldestElement.type) {
                case EventType.DiaryEntry:
                    ++diaryEntriesIndex;
                    break;
                case EventType.WbcDiffMeasurement:
                    ++measurementsIndex;
                    break;
                case EventType.QuestionnaireResponse:
                    ++qresponsesIndex;
                    break;
                case EventType.HeartEvent:
                    ++heartEventsIndex;
                    break;
                case EventType.DocumentInfo:
                    ++documentsIndex;
                    break;
                case EventType.BodyTemperature:
                    ++temperatureIndex;
                    break;
                case EventType.ConsentFileEvent:
                    ++consentFileIndex;
                    break;
                case EventType.ECGEvent:
                    ++ecgIndex;
                    break;
                default:
                    break;
            }

            eventList.push(oldestElement);
        }

        // Now all elements should be sorted in the list => return it.
        return eventList;
    }

    wbcDiffModel: WbcDiffModel;
    questionnaireModel: QuestionnaireModel;
    heartEventModel: HeartEventModel;
    documentModel: DocumentModel;
    diaryModel: DiaryModel;
    bodyTemperatureModel: BodyTemperatureModel;
    consentFileModel: ConsentFileModel;
    ecgModel: ECGModel;
}
