import {EventEmitter} from 'events';

import type {
    BlobCollection as OneBlobCollection,
    BlobDescriptor as OneBlobDescriptor
} from '../recipes/BlobRecipes';
import type ChannelManager from './ChannelManager';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    readBlobAsArrayBuffer
} from 'one.core/lib/storage';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

export interface BlobDescriptor {
    data: ArrayBuffer;
    lastModified: number;
    name: string;
    size: number;
    type: string;
}

export interface BlobCollection {
    name: string;
    blobs: BlobDescriptor[];
}

/**
 * This class handles storing and retrieving of blob collections.
 * All get methods are set to only use the ownerChannel
 *
 * Multiple files:
 * Storing: call addCollections with an array of files and a name.
 * Loading: call getCollection(name)
 *
 * Single file:
 * Storing: call addCollections with an array of files containing one element and a name.
 * Loading: call getCollection(name)[0]
 */
export default class BlobCollectionModel extends EventEmitter implements Model {
    /**
     * Event is emitted when blob collection data is updated.
     */
    public onUpdated = new OEvent<() => void>();

    private channelManager: ChannelManager;
    private channelOwner: SHA256IdHash<Person> | undefined;
    public static readonly channelId = 'blobCollections';
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
    }

    /**
     * allows to set the channel owner so that not all channels of all owners will be loaded
     * @param {SHA256IdHash<Person>} channelOwner
     */
    setChannelOwner(channelOwner: SHA256IdHash<Person>): void {
        this.channelOwner = channelOwner;
    }

    /**
     * Used to init the model to receive the updates.
     */
    async init() {
        await this.channelManager.createChannel(BlobCollectionModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    async addCollection(files: File[], name: OneBlobCollection['name']): Promise<void> {
        const blobCollection = await createSingleObjectThroughPurePlan(
            {module: '@module/createBlobCollection'},
            files,
            name
        );

        await this.channelManager.postToChannel(BlobCollectionModel.channelId, blobCollection.obj);
    }

    async getCollection(name: OneBlobCollection['name']): Promise<BlobCollection> {
        const collections = await this.channelManager.getObjectsWithType('BlobCollection', {
            owner: this.channelOwner,
            channelId: BlobCollectionModel.channelId
        });
        const collection = collections.find(objectData => objectData.data.name === name);
        if (collection) {
            return this.resolveBlobCollection(collection.data);
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
        }
    }

    async getLatestCollection(): Promise<BlobCollection> {
        const collection = await this.channelManager.getObjectsWithType('BlobCollection', {
            channelId: BlobCollectionModel.channelId,
            count: 1,
            owner: this.channelOwner
        });
        if (collection && collection.length > 0) {
            return this.resolveBlobCollection(collection[0].data);
        } else {
            throw new Error(`No BlobCollection found in channel`);
        }
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === BlobCollectionModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit();
        }
    }

    /**
     * Resolves the OneBlobCollection.blobs hash references to the actual ONE objects
     * @param {OneBlobCollection} blobCollection
     * @return {Promise<BlobCollection>}
     * @private
     */
    private async resolveBlobCollection(
        blobCollection: OneBlobCollection
    ): Promise<BlobCollection> {
        const blobDescriptors = await Promise.all(
            blobCollection.blobs.map(hash => getObject(hash))
        );
        const resolvedBlobDescriptors = await Promise.all(
            blobDescriptors.map(blobDescriptor =>
                BlobCollectionModel.resolveBlobDescriptor(blobDescriptor)
            )
        );
        return {...blobCollection, blobs: resolvedBlobDescriptors};
    }

    /**
     * Resolves the OneBlobDescriptor.data blob reference to tha actual ArrayBuffer data
     * @param {OneBlobDescriptor} blobDescriptor
     * @return {Promise<BlobDescriptor>}
     * @private
     */
    private static async resolveBlobDescriptor(
        blobDescriptor: OneBlobDescriptor
    ): Promise<BlobDescriptor> {
        const blobData = await readBlobAsArrayBuffer(blobDescriptor.data);

        return {...blobDescriptor, data: blobData};
    }
}
