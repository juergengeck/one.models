import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes.js';
import type {ObjectData, QueryOptions} from '../../../models/ChannelManager.js';

export type ChannelIterator<T extends OneUnversionedObjectTypes | unknown = unknown> = (
    queryOptions?: QueryOptions
) => AsyncIterableIterator<ObjectData<T>>;
