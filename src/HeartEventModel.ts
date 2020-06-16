import EventEmitter from 'events';

export enum HeartEventType {
    SomethingEvent
}

/**
 * This represents a HeartEvent
 */
export type HeartEvent = {
    date: Date;
    heartEventType: HeartEventType;
};

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class HeartEventModel extends EventEmitter {
    constructor() {
        super();
        this.heartEventList = [];
    }

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
    }

    /**
     * Get a list of heart rate events.
     */
    async heartEvents(): Promise<HeartEvent[]> {
        return [...this.heartEventList].sort((a, b) => {
            return b.date.getTime() - a.date.getTime();
        });
    }

    private readonly heartEventList: HeartEvent[]; // List of measurements. Will be stored in one instance later
}
