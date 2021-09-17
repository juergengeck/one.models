/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import type {ObjectData, QueryOptions} from './ChannelManager';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';

export type JournalEntry = {
    type: string;
    data: ObjectData<unknown>;
};

type JournalInput = {
    event: OEvent<(data: ObjectData<unknown>) => Promise<void> | void>;
    retrieveFn: (
        queryOptions?: QueryOptions
    ) => AsyncIterableIterator<ObjectData<unknown> | Promise<ObjectData<unknown>>>;
    eventType: string;
};

type JournalData = {
    [event: string]: {
        values: ObjectData<unknown>[];
        index: number;
    };
};

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export default class JournalModel extends EventEmitter implements Model {
    private readonly modelsDictionary: JournalInput[];

    private oEventListeners: Map<
        string,
        {
            disconnect: (() => void) | undefined;
            listener: (data: ObjectData<unknown>) => void;
        }
    > = new Map();

    public onUpdated = new OEvent<(data: ObjectData<unknown>, type: string) => void>();

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
            const oEventHandler = (data: ObjectData<unknown>) => {
                this.onUpdated.emit(data, event);
            };

            const disconnectFn = journalInput.event(oEventHandler.bind(this));

            // Persist the function reference in a map
            this.oEventListeners.set(event, {listener: oEventHandler, disconnect: disconnectFn});
        });
    }

    /**
     * removes the handler for every provided model
     */
    async shutdown(): Promise<void> {
        this.modelsDictionary.forEach((journalInput: JournalInput) => {
            const oEventHandler = this.oEventListeners.get(journalInput.eventType);

            if (oEventHandler && oEventHandler.disconnect) {
                oEventHandler.disconnect();
            }
        });
    }

    /**
     * Get the latest day stored events sorted by date. In Ascending order
     */
    async retrieveLatestDayEvents(): Promise<JournalEntry[]> {
        // If there are no provided models, return empty list
        if (this.modelsDictionary.length === 0) {
            return [];
        }

        // Data structure as a dictionary
        const dataDictionary: JournalData = {};

        const latestTo = new Date(await this.findLatestTimeFrame());
        const latestFrom = new Date(latestTo.valueOf() === 0 ? 0 : latestTo.valueOf() - ONE_DAY_MS);

        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.eventType;
                const data: ObjectData<unknown>[] = [];

                for await (const retrievedData of journalInput.retrieveFn({
                    to: latestTo,
                    from: latestFrom
                })) {
                    data.push(await retrievedData);
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
    ): AsyncIterableIterator<JournalEntry[]> {
        // Find the highest timestamp and set the currentTimeFrame to it.
        // The "from" field will be one day behind the "to" field.
        const to = new Date(await this.findLatestTimeFrame());
        const from = new Date(to.valueOf() === 0 ? 0 : to.valueOf() - ONE_DAY_MS);
        const currentTimeFrame = {from, to};

        // if there are no provided models
        if (this.modelsDictionary.length === 0) {
            return;
        }

        let counter = 0;
        let dataDictionary: JournalData = {};

        for (;;) {
            // If the current time frame reached time '0'
            if (currentTimeFrame.from.getTime() === 0 && currentTimeFrame.to.getTime() === 0) {
                // Yield the remaining values from the dictionary if it got to the end and the
                // dictionary still have values inside
                if (Array.from(Object.keys(dataDictionary)).length !== 0) {
                    yield this.createEventList(dataDictionary);
                }
                break;
            }

            for (const model of this.modelsDictionary) {
                const event = model.eventType;
                for await (const retrievedData of model.retrieveFn({
                    to: currentTimeFrame.to,
                    from: currentTimeFrame.from
                })) {
                    // If the pageSize condition is met
                    if (pageSize === counter) {
                        const eventListEntries = this.createEventList(dataDictionary);
                        yield eventListEntries;
                        dataDictionary = {};
                        counter = 0;
                    }

                    const data = await retrievedData;

                    // If the event exists in the dictionary and if the array exists, create a
                    // new array with the new value and the rest of the array
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

            // Move the TimeFrame to find the next latestTo Date. Start "from" 0 to the previous
            // "from" and update the currentTimeFrame with the found Values.
            const nextTo = new Date(
                await this.findLatestTimeFrame(new Date(0), currentTimeFrame.from)
            );

            currentTimeFrame.from = new Date(
                nextTo.valueOf() === 0 ? 0 : nextTo.valueOf() - ONE_DAY_MS
            );
            currentTimeFrame.to = nextTo;
        }
    }

    /**
     * Get the stored events sorted by date. In Ascending order
     * @returns {Promise<JournalEntry[]>}
     */
    async retrieveAllEvents(): Promise<JournalEntry[]> {
        // If there are no provided models, return empty list
        if (this.modelsDictionary.length === 0) {
            return [];
        }

        // Data structure as a dictionary
        const dataDictionary: JournalData = {};

        // Map every provided model to the data dictionary and get their values
        await Promise.all(
            this.modelsDictionary.map(async (journalInput: JournalInput) => {
                const event = journalInput.eventType;
                const data: ObjectData<unknown>[] = [];
                for await (const retrievedData of journalInput.retrieveFn()) {
                    data.push(await retrievedData);
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
    private createEventList(dataDictionary: JournalData): JournalEntry[] {
        // Get the total length of data values
        const totalLen = Object.keys(dataDictionary)
            .map((event: string) => dataDictionary[event].values.length)
            .reduce((acc: number, cur: number) => acc + cur);

        const eventList = [];

        for (let i = 0; i < totalLen; ++i) {
            const compareElements = [];

            for (const event of Object.keys(dataDictionary)) {
                // Get the actual object
                const eventData = dataDictionary[event];

                // Check the index if it has values left
                if (eventData.index < eventData.values.length) {
                    compareElements.push({
                        /** put the data key as the event type, also = model class name **/
                        type: event,
                        data: eventData.values[eventData.index]
                    });
                }
            }

            // This checks if the number of loop iterations are all right. It should always be
            // ok unless there is a programming error in this algorithm.
            // This should never happen!
            if (compareElements.length === 0) {
                throw new Error('Not enough compare elements in input lists');
            }

            // Let's find the element with the newest date
            let oldestElement = compareElements[0];
            for (const compareElement of compareElements) {
                if (compareElement.data.creationTime < oldestElement.data.creationTime) {
                    oldestElement = compareElement;
                }
            }

            // Increment the added item. OldestElement.type is the actual key of the object
            dataDictionary[oldestElement.type].index++;

            eventList.push(oldestElement);
        }

        // Now all elements should be sorted in the list => return it
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
                let data: ObjectData<unknown> | null = null;

                for await (const retrievedData of journalInput.retrieveFn({
                    count: 1,
                    to: to,
                    from: from
                })) {
                    data = await retrievedData;
                }

                if (data !== null) {
                    return data.creationTime.getTime();
                }

                return 0;
            })
        );

        return Math.max(...timestamps);
    }
}
