import type {BLOB, Person, Recipe} from 'one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        ChatMessage: ChatMessage;
    }
}

export interface ChatMessage {
    $type$: 'ChatMessage';
    text: string;
    attachments?: SHA256Hash<BLOB>[];
    sender: SHA256IdHash<Person>;
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

const ChatRecipes: Recipe[] = [ChatMessageRecipe];

export default ChatRecipes;
