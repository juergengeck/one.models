import EventEmitter = NodeJS.EventEmitter;
import {BlobCollection} from '@OneCoreTypes';
import ChannelManager from './ChannelManager';

export default class BlobCollectionModel extends EventEmitter {
    private collections: BlobCollection[] = [];
    channelManager: ChannelManager;
    channelId = 'blobCollections';

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
    }

    addCollection(files: File[]): void {}

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
