import {OEvent} from '../misc/OEvent';

/**
 * Models interface.
 */
export interface Model {
    onUpdated: OEvent<() => void>;
    shutdown(): Promise<void>;
}
