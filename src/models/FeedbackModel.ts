import EventEmmiter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {Feedback as OneFeedback} from '@OneCoreTypes';

/**
 * This represents the model of a feedback
 *
 */
export type Feedback = {
    title: string;
    content: string;
};

/**
 * Convert from model representation to one representation.
 *
 *  @param {Feedback} modelObject - the model object
 * @returns {OneFeedback} The corresponding one object
 *
 */

function convertToOne(modelObject: Feedback): OneFeedback {
    // Create the resulting object
    return {
        $type$: 'Feedback',
        title: modelObject.title,
        content: modelObject.content
    };
}

function convertFromOne(oneObject: OneFeedback): Feedback {
    // Create the new ObjectData item
    return {title: oneObject.title, content: oneObject.content};
}

/**
 * This model implements the possibility to add feedback
 *
 */
export default class FeedbackModel extends EventEmmiter {
    channelManager: ChannelManager;
    channelId: string;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'feedbackChannel';
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', (id) => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    async addFeedback(feedback: Feedback): Promise<void> {
        if (!feedback) {
            throw new Error('empty file');
        }

        await this.channelManager.postToChannel(this.channelId, convertToOne(feedback));
    }

    async entries(): Promise<ObjectData<Feedback>[]> {
        const objects: ObjectData<Feedback>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'Feedback'
        );

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }
}
