import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneIdObjectInterfaces {
        Settings: Pick<Settings, 'id' | 'type'>;
    }

    export interface OneVersionedObjectInterfaces {
        Settings: Settings;
    }

    export interface Settings {
        type: 'Settings';
        id: string;
        properties: Map<string, string>;
    }
}

export const ApplicationSettingsRecipe: Recipe = {
    type: 'Recipe',
    name: 'Settings',
    rule: [
        {
            itemprop: 'id',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'properties',
            valueType: 'Map'
        }
    ]
};

// Export recipies

const SettingsRecipe: Recipe[] = [ApplicationSettingsRecipe];

export default SettingsRecipe;
