import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {News as OneNews} from '@OneCoreTypes';

/**
 * This represents the model of a news for now
 *
 */
export type News = {
    content: string;
};

/**
 * Convert from model representation to one representation.
 * @param {News} modelObject - the model object
 * @returns {OneNews} The corresponding one object
 *
 */

function convertToOne(modelObject: News): OneNews {
    return {
        $type$: 'News',
        content: modelObject.content
    };
}

function convertFromOne(oneObject: OneNews): News {
    return {content: oneObject.content};
}

/**
 * This model implements a broadcast channel.
 */
export default class NewsModel extends EventEmitter {
    channelManager: ChannelManager;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * Initialize this instance of the feedback and news channel
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel('feedbackChannel');
        await this.channelManager.createChannel('newsChannel');
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
    }

    async addNews(content: string): Promise<void> {
        await this.postContent('newsChannel', content);
    }

    async addFeedback(content: string): Promise<void> {
        await this.postContent('feedbackChannel', content);
    }

    private async postContent(channelId: string, content: string): Promise<void> {
        await this.channelManager.postToChannel(channelId, convertToOne({content: content}));
        this.emit('news');
    }

    /**
     *
     * retrieve the news or feedback depending on the channel id provided
     */
    async entries(channelId: string): Promise<ObjectData<News>[]> {
        const objects: ObjectData<News>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(channelId, 'News');

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === 'feedbackChannel' || id === 'newsChannel') {
            this.emit('updated');
        }
    }
}
