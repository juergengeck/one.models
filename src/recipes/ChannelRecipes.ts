import type {Person, Recipe} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {CreationTime} from './MetaRecipes';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        ChannelEntry: ChannelEntry;
    }

    export interface OneIdObjectInterfaces {
        ChannelInfo: Pick<ChannelInfo, 'id' | 'owner' | '$type$'>;
        ChannelRegistry: Pick<ChannelRegistry, 'id' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        ChannelInfo: ChannelInfo;
        ChannelRegistry: ChannelRegistry;
    }
}

export interface ChannelEntry {
    $type$: 'ChannelEntry';
    data: SHA256Hash<CreationTime>;
    previous?: SHA256Hash<ChannelEntry>;
}

export interface ChannelInfo {
    $type$: 'ChannelInfo';
    id: string;
    owner: SHA256IdHash<Person>;
    head?: SHA256Hash<ChannelEntry>;
}

export interface ChannelRegistryEntry {
    channelInfoIdHash: SHA256IdHash<ChannelInfo>; // The channel info object of the channel
    readVersionIndex: number; // Index of the merged version suitable for reading
    mergedVersionIndex: number; // Index in the version map that was merged (higher ones are unmerged)
}

export interface ChannelRegistry {
    $type$: 'ChannelRegistry';
    id: 'ChannelRegistry';
    channels: ChannelRegistryEntry[];
}

export const ChannelEntryRecipie: Recipe = {
    $type$: 'Recipe',
    name: 'ChannelEntry',
    rule: [
        {
            itemprop: 'data',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['CreationTime'])}
        },
        {
            itemprop: 'previous',
            optional: true,
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['ChannelEntry'])}
        }
    ]
};

export const ChannelInfoRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ChannelInfo',
    rule: [
        {
            itemprop: 'id',
            itemtype: {type: 'string'},
            isId: true
        },
        {
            itemprop: 'owner',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
            isId: true
        },
        {
            itemprop: 'head',
            optional: true,
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['ChannelEntry'])}
        }
    ]
};

export const ChannelRegistryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ChannelRegistry',
    rule: [
        {
            itemprop: 'id',
            itemtype: {type: 'string', regexp: /^ChannelRegistry$/},
            isId: true
        },
        {
            itemprop: 'channels',
            itemtype: {
                type: 'bag',
                item: {
                    type: 'object',
                    rules: [
                        {
                            itemprop: 'channelInfoIdHash',
                            itemtype: {
                                type: 'referenceToId',
                                allowedTypes: new Set(['ChannelInfo'])
                            }
                        },
                        {
                            itemprop: 'readVersionIndex',
                            itemtype: {type: 'number'}
                        },
                        {
                            itemprop: 'mergedVersionIndex',
                            itemtype: {type: 'number'}
                        }
                    ]
                }
            }
        }
    ]
};

const ChannelRecipes: Recipe[] = [ChannelEntryRecipie, ChannelInfoRecipe, ChannelRegistryRecipe];

export default ChannelRecipes;
