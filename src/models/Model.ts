import {OEventType} from '../misc/OEvent';

/**
 * Models interface.
 */
export interface Model {
    onUpdated: OEventType<() => void>;
    shutdown(): Promise<void>;
}
