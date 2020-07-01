import EventEmitter from 'events';
import {createCryptoHash} from 'one.core/lib/system/crypto-helpers';
import ChannelManager, {ObjectData} from "./ChannelManager";
import {News as OneNews} from '@OneCoreTypes';

/**
 * This represents a channel news
 */
export type ChannelNews = {
    date: Date;
    personId: string;
    channelId: string;
    newsId: string;
    content: string;
};

export type ChannelProperties = {
    channelId: string;
    unreadNews: number;
};

/**
 * This represents the model of a news for now
 *
 */
export type News = {
    content: string;
};

/**
 * Convert from model representation to one representation.
 *
 *  @param {News} modelObject - the model object
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

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.channelNews = new Map<string, ChannelNews[]>(); // for each channelId an array of news
        this.channelReadMarker = new Map<string, string>();

        // List of events. Naming should probably be changed.
        // Events: news: New news have been created
        // Events: readMarkerUpdated: The read counter was updated
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel('feedback');
        await this.channelManager.createChannel('1235');
        this.channelManager.on('updated', (id) => {
            if (id === 'feedback' || id === '1235') {
                this.emit('updated');
            }
        });
    }
    // ############### News handling #######################

    /**
     * Post news to a specific channel.
     *
     * @param   {string}    channelId - Id of channel.
     * @param   {string}    news - News to post.
     */
    async postNews(channelId: string, news: string): Promise<void> {
        if (!this.channelNews.has(channelId)) {
            throw new Error('The channel with id: ' + channelId + ' does not exist');
        }

        const newsId = await createCryptoHash(news);

        // Write the news to the storage
        this.channelNews.get(channelId)!.push({
            date: new Date(),
            personId: '1234', // This should actually be my personal id?
            // We need to make sure how to connect stuff to
            // identities
            channelId: channelId,
            newsId: newsId,
            content: news
        });

        await this.markAsRead(channelId, newsId);
        this.emit('news', channelId);
    }

    /**
     * Get news from one channel.
     *
     * @param {string} channelId - Id of the corresponding channel
     * @param {number} count - Number of news to get. 0 for all of them
     */
    async news(channelId: string, count: number): Promise<ChannelNews[]> {
        let ret = [...this.channelNews.get(channelId)].sort((a, b) => {
            return b.date.getTime() - a.date.getTime();
        });

        if (count > 0) {
            ret = ret.slice(0, count);
        }

        return ret;
    }

    /**
     * Emit an event when more news need to be loaded.
     *
     * @param {string} channelId - Id of the corresponding channel
     */
    loadMoreNews(channelId: string): void {
        this.emit('loadMoreNews', channelId);
    }

    // ############### Unread news handling #######################

    /**
     * Mark the news up to a certain point as read.
     *
     * @param {string} channelId - The channel
     * @param {string} newsId -  The news that is read last. The reason for doing this is that
     *                              when a new news arrives during executing the markAsRead
     *                              function we might loose the notification of the newly arrived
     *                              news. So we should pass the id of the latest read news.
     */
    async markAsRead(channelId: string, newsId: string): Promise<void> {
        this.channelReadMarker.set(channelId, newsId);
        this.emit('readMarkerUpdated', channelId);
    }

    // ############### Channel handling #######################

    /** Creates a channel with the following person.
     *
     *  @param  {string}    personId - Person with which to create a channel.
     *  @returns {string}   Id of the newly created hash or the id of an already existing hash
     */
    async createChannelWithPerson(personId: string): Promise<string> {
        if (!this.channelNews.has(personId)) {
            this.channelNews.set(personId, []);
            return personId.toString();
        }

        return 'Channel already exist!';
    }

    /**
     * Get a list of channels.
     */
    async channels(): Promise<ChannelProperties[]> {
        const channelsProperties: ChannelProperties[] = [];

        for (const [channelId, news] of this.channelNews) {
            let unreadNews = news.length;
            const readMarker = this.channelReadMarker.get(channelId);

            // If we have a read marker, then let's convert it to a number
            if (readMarker) {
                for (let i = news.length - 1; i > 0; --i) {
                    if (news[i].newsId === readMarker) {
                        unreadNews = news.length - 1 - i;
                        break;
                    }
                }
            }

            channelsProperties.push({
                channelId: channelId,
                unreadNews: unreadNews
            });
        }

        return channelsProperties;
    }

    /**
     * Removes all chat news from the list.
     *
     * At the moment this doesn't do anything, because we haven't decided on a concept
     * for deletion, yet. (mark this as archived perhaps, so that it does not clutter
     * the view of the user)
     *
     * @param {string} channelId - Id of channel to remove
     */
    async removeChannel(channelId: string): Promise<void> {
        // What should we do here?
        // Since one does not loose data we somehow need to mark it as archived / deleted
    }

    // ############### Id handling #######################
    /**
     * Get the name of a person.
     *
     * The purpose is to display the name of the owner of the broadcast channel (The clinic I think).
     *
     * @param {string} personId - The person identifier
     */
    async personName(personId: string): Promise<string> {
        if (personId === '1234') {
            return 'me';
        } else if (personId === '1235') {
            return 'alice';
        } else if (personId === '1236') {
            return 'bob';
        } else {
            throw new Error('Person id unknown');
        }
    }

    // ############### DEBUGGING STUFF #######################

    async addNews(content: string,personId: string): Promise<void> {
        await this.postContent('1235','1235',content);
        await this.channelManager.postToChannel('1235', convertToOne({content:content}));
    }

    async  addFeedback(content: string): Promise<void> {
        await this.postContent('feedback','feedback',content);
        await this.channelManager.postToChannel('feedback', convertToOne({content:content}));
    }

    private async postContent(channelId: string,personId: string,content: string): Promise<void> {
        await this.createChannelWithPerson(channelId);

        const newsId = await createCryptoHash(content);

        // Write the message to the storage
        this.channelNews.get(channelId)!.push({
            date: new Date(),
            personId: channelId, // This should actually be my personal id?
            // We need to make sure how to connect stuff to
            // identities
            channelId: channelId,
            newsId: newsId,
            content: content
        });

        // Forward the read pointer
        await this.markAsRead(channelId, newsId);
        this.emit('news');
        this.emit('readMarkerUpdated', channelId);
    }
    async entries(channelId: string): Promise<ObjectData<News>[]> {
        const objects: ObjectData<News>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(
            channelId,
            'News'
        );

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }



    private readonly channelNews: Map<string, ChannelNews[]>; // List of chat messages
    private readonly channelReadMarker: Map<string, string>; // The marker of the unread message
}
