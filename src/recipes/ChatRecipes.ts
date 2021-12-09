import type {BLOB, Person, Recipe} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {ChannelInfo} from './ChannelRecipes';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        ChatMessage: ChatMessage;
        Topic: Topic;
    }

    export interface OneIdObjectInterfaces {
        TopicAppRegistry: Pick<ChannelInfo, 'id'>;
    }

    export interface OneVersionedObjectInterfaces {
        TopicAppRegistry: TopicAppRegistry;
    }
}

export interface Topic {
    $type$: 'Topic';
    // one-to-one relationship between the id and the channelID
    id: string;
    channel: SHA256IdHash<ChannelInfo>;
    name?: string;
}

export interface ChatMessage {
    $type$: 'ChatMessage';
    text: string;
    attachments?: SHA256Hash<BLOB>[];
    sender: SHA256IdHash<Person>;
}

type TopicChannelID = string;


export interface TopicAppRegistry {
    $type$: 'TopicAppRegistry';
    id: 'TopicAppRegistry';
    topics: Map<TopicChannelID, SHA256Hash<Topic>>;
}

export const ChatMessageRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ChatMessage',
    rule: [
        {
            itemprop: 'text',
            itemtype: {type: 'string'}
        },
        {
            itemprop: 'attachments',
            itemtype: {type: 'bag', item: {type: 'referenceToBlob'}},
            optional: true
        },
        {
            itemprop: 'sender',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['Person'])}
        }
    ]
};

export const TopicRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Topic',
    rule: [
        {
            itemprop: 'name',
            itemtype: {type: 'string'},
            optional: true
        },
        {
            itemprop: 'id',
            itemtype: {type: 'string'},
        },
        {
            itemprop: 'channel',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['ChannelInfo'])}
        }
    ]
};

export const TopicAppRegistryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'TopicAppRegistry',
    rule: [
        {
            itemprop: 'id',
            isId: true,
            itemtype: {type: 'string', regexp: /^TopicAppRegistry$/}
        },
        {
            itemprop: 'topics',
            itemtype: {
                type: 'map',
                key: {type: 'string'},
                value: {type: 'referenceToObj', allowedTypes: new Set(['Topic'])}
            }
        }
    ]
};

const ChatRecipes: Recipe[] = [ChatMessageRecipe, TopicRecipe, TopicAppRegistryRecipe];

export default ChatRecipes;
