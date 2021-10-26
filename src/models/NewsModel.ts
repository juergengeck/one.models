import type ChannelManager from './ChannelManager';
import type {ObjectData} from './ChannelManager';
import type {News as OneNews} from '../recipes/NewsRecipes';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import {createModelStateMachine} from './Model';
import type {StateMachine} from '../misc/StateMachine';

/**
 * This represents the model of a news for now
 *
 */
export type News = {
    content: string;
};

/**
 * Convert from model representation to one representation.
 * @param modelObject - the model object
 * @returns The corresponding one object
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
export default class NewsModel implements Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    /**
     * Event emitted when news data is updated.
     */
    public onNewsEvent = new OEvent<() => void>();
    /**
     * Event emitted when news or feedback data is updated.
     */
    public onUpdated = new OEvent<() => void>();

    channelManager: ChannelManager;

    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        this.channelManager = channelManager;
        this.state = createModelStateMachine();
    }

    /**
     * Initialize this instance of the feedback and news channel
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel('feedbackChannel');
        await this.channelManager.createChannel('newsChannel');
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    async addNews(content: string): Promise<void> {
        this.state.assertCurrentState('Initialised');

        await this.postContent('newsChannel', content);
    }

    async addFeedback(content: string): Promise<void> {
        this.state.assertCurrentState('Initialised');

        await this.postContent('feedbackChannel', content);
    }

    /**
     *
     * retrieve the news or feedback depending on the channel id provided
     */
    async entries(channelId: string): Promise<ObjectData<News>[]> {
        this.state.assertCurrentState('Initialised');

        const objects: ObjectData<News>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType('News', {
            channelId: channelId
        });

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    private async postContent(channelId: string, content: string): Promise<void> {
        await this.channelManager.postToChannel(channelId, convertToOne({content: content}));
        this.onNewsEvent.emit();
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === 'feedbackChannel' || id === 'newsChannel') {
            this.onUpdated.emit();
        }
    }
}
