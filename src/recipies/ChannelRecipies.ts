import {
    AuthenticatedContact,
    Instance,
    OneUnversionedObjectTypes,
    Recipe,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';
import {ORDERED_BY} from "one.core/lib/recipes";

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        ChannelEntry: ChannelEntry;
    }

    export interface ChannelEntry {
        type: 'ChannelEntry';
        data: SHA256Hash<CreationTime>;
        previous?: SHA256Hash<ChannelEntry>;
    }
}

export const ChannelEntryRecipie: Recipe = {
    type: 'Recipe',
    name: 'ChannelEntry',
    rule: [
        {
            itemprop: 'data',
            referenceToObj: new Set(['CreationTime'])
        },
        {
            itemprop: 'previous',
            optional: true,
            referenceToObj: new Set(['ChannelEntry'])
        }
    ]
};

// Channel Info

declare module '@OneCoreTypes' {
    export interface OneIdObjectInterfaces {
        ChannelInfo: Pick<ChannelInfo, 'id' | 'type'>;
    }

    export interface OneVersionedObjectInterfaces {
        ChannelInfo: ChannelInfo;
        ChannelRegistry: ChannelRegistry;
    }

    export interface ChannelInfo {
        type: 'ChannelInfo';
        id: string;
        owner: SHA256IdHash<Person>;
        head?: SHA256Hash<ChannelEntry>;
    }

    export interface ChannelRegistry {
       type: 'ChannelRegistry';
       id: 'ChannelRegistry';
       channels: SHA256IdHash<ChannelInfo>[]
    }

}

export const ChannelAppRecipe: Recipe = {
    type: 'Recipe',
    name: 'ChannelRegistry',
    rule: [
        {
            itemprop: 'id',
            regexp: /^ChannelRegistry$/,
            isId: true
        },
        {
            itemprop: 'channels',
            referenceToId: new Set(['ChannelInfo']),
            list: ORDERED_BY.ONE
        }
    ]
};

export const ChannelInfoRecipie: Recipe = {
    type: 'Recipe',
    name: 'ChannelInfo',
    rule: [
        {
            itemprop: 'id',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'owner',
            referenceToId: new Set(['Person']),
            isId: true
        },
        {
            itemprop: 'head',
            optional: true,
            referenceToObj: new Set(['ChannelEntry'])
        }
    ]
};

// Export recipies

const ChannelRecipes: Recipe[] = [ChannelEntryRecipie, ChannelInfoRecipie];

export default ChannelRecipes;
