import EventEmitter from 'events';
import {
    BlobCollection as OneBlobCollection,
    BlobDescriptor as OneBlobDescirptor,
    Person,
    SHA256IdHash
} from '@OneCoreTypes';
import ChannelManager, {ObjectData} from './ChannelManager';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    readBlobAsArrayBuffer
} from 'one.core/lib/storage';

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
export default class BlobCollectionModel extends EventEmitter {
    private channelManager: ChannelManager;
    private channelOwner: SHA256IdHash<Person> | undefined;
    private channelId = 'blobCollections';
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
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
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    async addCollection(files: File[], name: OneBlobCollection['name']): Promise<void> {
        const blobCollection = await createSingleObjectThroughPurePlan(
            {module: '@module/createBlobCollection'},
            files,
            name
        );

        await this.channelManager.postToChannel(this.channelId, blobCollection.obj);
    }

    async getCollection(name: OneBlobCollection['name']): Promise<BlobCollection> {
        const collections = await this.channelManager.getObjectsWithType('BlobCollection', {
            owner: this.channelOwner,
            channelId: this.channelId
        });
        const collection = collections.find(
            (objectData: ObjectData<OneBlobCollection>) => objectData.data.name === name
        );
        if (collection) {
            return this.resolveBlobCollection(collection.data);
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
        }
    }

    async getLatestCollection(): Promise<BlobCollection> {
        const collection = await this.channelManager.getObjectsWithType(
            'BlobCollection',
            {
                channelId: this.channelId,
                count: 1,
                owner: this.channelOwner
            }
        );
        if (collection && collection.length > 0) {
            return this.resolveBlobCollection(collection[0].data);
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
        }
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
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
        const blobDescriptors: OneBlobDescirptor[] = await Promise.all(
            blobCollection.blobs.map(hash => getObject(hash))
        );
        const resolvedBlobDescriptors: BlobDescriptor[] = await Promise.all(
            blobDescriptors.map(blobDescriptor =>
                BlobCollectionModel.resolveBlobDescriptor(blobDescriptor)
            )
        );
        return {...blobCollection, blobs: resolvedBlobDescriptors};
    }

    /**
     * Resolves the OneBlobDescirptor.data blob reference to tha actual ArrayBuffer data
     * @param {OneBlobDescirptor} blobDescriptor
     * @return {Promise<BlobDescriptor>}
     * @private
     */
    private static async resolveBlobDescriptor(
        blobDescriptor: OneBlobDescirptor
    ): Promise<BlobDescriptor> {
        const blobData = await readBlobAsArrayBuffer(blobDescriptor.data);

        return {...blobDescriptor, data: blobData};
    }
}