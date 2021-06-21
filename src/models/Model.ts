import type {OEvent} from '../misc/OEvent';
import type {ObjectData} from './ChannelManager';

/**
 * Models interface.
 */
export interface Model {
    onUpdated: OEvent<(data: ObjectData<unknown>) => void>;
    shutdown(): Promise<void>;
}
