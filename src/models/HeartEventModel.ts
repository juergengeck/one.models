import EventEmitter from 'events';
import {OEvent} from '../misc/OEvent';
import {Model} from './Model';

export enum HeartEventType {
    SomethingEvent
}

/**
 * This represents a HeartEvent
 */
export type HeartEvent = {
    creationTime: Date;
    heartEventType: HeartEventType;
};

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class HeartEventModel extends EventEmitter implements Model {
    /**
     * Event emitted when heart data is added.
     */
    public onUpdated = new OEvent<(data: HeartEvent) => void>();

    constructor() {
        super();
        this.heartEventList = [];
    }

    async shutdown(): Promise<void> {}

    /**
     * Create a new response for a questionnaire.
     *
     * @param {string} data - The answers for the questionnaire
     */
    async addHeartEvent(data: HeartEvent): Promise<void> {
        data = Object.assign({}, data); // shallow copy, because we modify it

        // Write the data to storage
        this.heartEventList.push(data);
        this.emit('updated');
        this.onUpdated.emit(data);
    }

    /**
     * Get a list of heart rate events.
     */
    async heartEvents(from?: Date, to?: Date, count?: number): Promise<HeartEvent[]> {
        let data: HeartEvent[] = this.heartEventList;

        if (from) {
            data = data.filter(item => item.creationTime.getTime() > from.getTime());
        }

        if (to) {
            data = data.filter(item => item.creationTime.getTime() < to.getTime());
        }

        if (count) {
            data = data.slice(0, count);
        }

        return data.sort((a, b) => {
            return b.creationTime.getTime() - a.creationTime.getTime();
        });
    }

    private readonly heartEventList: HeartEvent[]; // List of measurements. Will be stored in one instance later
}
