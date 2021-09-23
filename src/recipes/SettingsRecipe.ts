import type {Recipe} from 'one.core/lib/recipes';

declare module '@OneObjectInterfaces' {
    export interface OneIdObjectInterfaces {
        Settings: Pick<Settings, 'id' | '$type$'>;
    }

    export interface OneVersionedObjectInterfaces {
        Settings: Settings;
    }
}

export interface Settings {
    $type$: 'Settings';
    id: string;
    properties: Map<string, string>;
}

export const ApplicationSettingsRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Settings',
    rule: [
        {
            itemprop: 'id',
            itemtype: {type: 'string'},
            isId: true
        },
        {
            itemprop: 'properties',
            itemtype: {type: 'map', key: {type: 'string'}, value: {type: 'stringifiable'}}
        }
    ]
};

const SettingsRecipe: Recipe[] = [ApplicationSettingsRecipe];

export default SettingsRecipe;
