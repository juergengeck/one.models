import {OEvent} from '../misc/OEvent';

/**
 * Models interface.
 */
export interface Model {
    onUpdated: OEvent<(data: ObjectData<unknown>) => void>;
    shutdown(): Promise<void>;
}
