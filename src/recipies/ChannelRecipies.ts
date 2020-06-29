import {
    Recipe,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';

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
        channels: Map<SHA256IdHash<ChannelInfo>, SHA256Hash<ChannelInfo>>;
    }
}

// for each channel you have to store the latest versions which was merged
// step form the lastest version map to the version from the map
// Map<idHash, hash>
export const ChannelRegistryRecipe: Recipe = {
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
            valueType: 'Map'
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

const ChannelRecipes: Recipe[] = [ChannelEntryRecipie, ChannelInfoRecipie, ChannelRegistryRecipe];

export default ChannelRecipes;
