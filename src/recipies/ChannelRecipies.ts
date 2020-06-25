import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        ChannelEntry: ChannelEntry;
    }

    export interface ChannelEntry {
        $type$: 'ChannelEntry';
        data: SHA256Hash<CreationTime>;
        previous?: SHA256Hash<ChannelEntry>;
    }
}

export const ChannelEntryRecipie: Recipe = {
    $type$: 'Recipe',
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
        ChannelInfo: Pick<ChannelInfo, 'id' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        ChannelInfo: ChannelInfo;
    }

    export interface ChannelInfo {
        $type$: 'ChannelInfo';
        id: string;
        head?: SHA256Hash<ChannelEntry>;
    }
}

export const ChannelInfoRecipie: Recipe = {
    $type$: 'Recipe',
    name: 'ChannelInfo',
    rule: [
        {
            itemprop: 'id',
            valueType: 'string',
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
