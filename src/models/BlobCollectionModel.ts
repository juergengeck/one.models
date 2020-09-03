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
import ContactModel from './ContactModel';

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

export default class BlobCollectionModel extends EventEmitter {
    channelManager: ChannelManager;
    contactManager: ContactModel;
    owner: SHA256IdHash<Person> | undefined;
    channelId = 'blobCollections';

    constructor(channelManager: ChannelManager, contactModel: ContactModel) {
        super();

        this.channelManager = channelManager;
        this.contactManager = contactModel;
    }

    /**
     * Used to init the model to receive the updates.
     */
    async init() {
        await this.channelManager.createChannel(this.channelId);
        this.owner = await this.contactManager.myMainIdentity();
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    async addCollection(files: File[], name: string): Promise<void> {
        const blobCollection = await createSingleObjectThroughPurePlan(
            {module: '@module/createBlobCollection'},
            files,
            name
        );

        await this.channelManager.postToChannel(this.channelId, blobCollection.obj);
    }

    async getCollection(name: OneBlobCollection['name']): Promise<BlobCollection> {
        const collections = await this.channelManager.getObjectsWithType(
            this.channelId,
            'BlobCollection',
            {owner: this.owner}
        );
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
            this.channelId,
            'BlobCollection',
            {
                count: 1,
                owner: this.owner
            }
        );
        if (collection && collection.length > 0) {
            return this.resolveBlobCollection(collection[0].data);
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
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
