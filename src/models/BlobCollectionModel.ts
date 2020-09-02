import EventEmitter from 'events';
import {BlobCollection, Person, SHA256IdHash} from '@OneCoreTypes';
import ChannelManager, {ObjectData} from './ChannelManager';
import {createSingleObjectThroughPurePlan} from 'one.core/lib/storage';
import ContactModel from './ContactModel';

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

    async getCollection(name: BlobCollection['name']): Promise<BlobCollection> {
        const collections = await this.channelManager.getObjectsWithType(
            this.channelId,
            'BlobCollection',
            {owner: this.owner}
        );
        const collection = collections.find(
            (objectData: ObjectData<BlobCollection>) => objectData.data.name === name
        );
        if (collection) {
            return collection.data;
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
        if (collection) {
            // todo change return value, load all blobs as arrayBuffers
            return collection[0].data;
        } else {
            throw new Error(`BlobCollection ${name} not found.`);
        }
    }
}
