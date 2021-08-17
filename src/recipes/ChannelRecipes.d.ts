import type { Person, Recipe } from 'one.core/lib/recipes';
import type { SHA256Hash, SHA256IdHash } from 'one.core/lib/util/type-checks';
import type { CreationTime } from './MetaRecipes';
declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        ChannelEntry: ChannelEntry;
    }
    interface OneIdObjectInterfaces {
        ChannelInfo: Pick<ChannelInfo, 'id' | 'owner' | '$type$'>;
        ChannelRegistry: Pick<ChannelRegistry, 'id' | '$type$'>;
    }
    interface OneVersionedObjectInterfaces {
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
    channelInfoIdHash: SHA256IdHash<ChannelInfo>;
    readVersionIndex: number;
    mergedVersionIndex: number;
}
export interface ChannelRegistry {
    $type$: 'ChannelRegistry';
    id: 'ChannelRegistry';
    channels: ChannelRegistryEntry[];
}
export declare const ChannelEntryRecipie: Recipe;
export declare const ChannelInfoRecipe: Recipe;
export declare const ChannelRegistryRecipe: Recipe;
declare const ChannelRecipes: Recipe[];
export default ChannelRecipes;
//# sourceMappingURL=ChannelRecipes.d.ts.map