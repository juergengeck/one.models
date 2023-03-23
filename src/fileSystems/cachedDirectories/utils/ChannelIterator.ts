import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import type {ObjectData, QueryOptions} from '../../../models/ChannelManager';

export type ChannelIterator<T extends OneUnversionedObjectTypes | unknown = unknown> = (
    queryOptions?: QueryOptions
) => AsyncIterableIterator<ObjectData<T>>;
