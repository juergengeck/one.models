import EventEmitter from 'events';
import {BlobCollection} from '@OneCoreTypes';
import ChannelManager from './ChannelManager';
import {createSingleObjectThroughPurePlan} from 'one.core/lib/storage';

export default class BlobCollectionModel extends EventEmitter {
    private collections: BlobCollection[] = [];
    channelManager: ChannelManager;
    channelId = 'blobCollections';

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
    }

    async addCollection(files: File[], name: string): Promise<void> {
        const blobCollection = await createSingleObjectThroughPurePlan(
            {module: '@module/createBlobCollection'},
            files,
            name
        );
    }

    getCollection(name: BlobCollection['name']): BlobCollection {
        const collection = this.collections.find(collection => collection.name === name);

        if (collection) {
            return collection;
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
        }
    }

    getLatestCollection(): BlobCollection {
        const collection = this.collections[this.collections.length - 1];

        if (collection) {
            return collection;
        } else {
            throw new Error(`No collections were found.`);
        }
    }
}
