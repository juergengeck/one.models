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
    async heartEvents(): Promise<HeartEvent[]> {
        return [...this.heartEventList].sort((a, b) => {
            return b.creationTime.getTime() - a.creationTime.getTime();
        });
    }

    /**
     * returns iterator for heartEvents
     * @param from
     * @param to
     */
    async *heartEventsIterator(from?: Date, to?: Date): AsyncIterableIterator<HeartEvent> {
        const sortedHeartEvents = this.heartEventList.sort((a, b) => {
            return b.creationTime.getTime() - a.creationTime.getTime();
        });
        for (const heartEvent of sortedHeartEvents) {
            if (
                from &&
                to &&
                heartEvent.creationTime.getTime() > from.getTime() &&
                heartEvent.creationTime.getTime() < to.getTime()
            ) {
                yield heartEvent;
            } else if (from && heartEvent.creationTime.getTime() > from.getTime()) {
                yield heartEvent;
            } else if (to && heartEvent.creationTime.getTime() < to.getTime()) {
                yield heartEvent;
            } else {
                yield heartEvent;
            }
        }
    }

    private readonly heartEventList: HeartEvent[]; // List of measurements. Will be stored in one instance later
}
