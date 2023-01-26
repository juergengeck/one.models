// Pseudo implementation, did not compile it
import {OEvent} from '../misc/OEvent';
import type ChannelManager from './ChannelManager';

export default class Notifications {
    private notificationCounters = new Map<string, number>();

    // Without arguments, this is just to force a rerender of the UI component, not to get the new notification count
    private onNewNotification = new OEvent<() => {}>();

    constructor(channelManager: ChannelManager) {
        channelManager.onUpdated((channelId, _data) => {
            this.increaseNotificatioinCountForTopic(channelId);
        });
    }

    /**
     * Get the notification count for a topic
     *
     * @param topicId
     */
    getNotificationCountForTopic(topicId: string): number {
        return this.notificationCounters.get(topicId) || 0;
    }

    /**
     * Call this when you read all messages in a topic.
     *
     * @param topicId
     */
    resetNotificatioinCountForTopic(topicId: string): void {
        this.notificationCounters.delete(topicId);
        this.onNewNotification.emit();
    }

    private increaseNotificatioinCountForTopic(topicId: string): void {
        this.notificationCounters.set(topicId, this.getNotificationCountForTopic(topicId));
        this.onNewNotification.emit();
    }
}
