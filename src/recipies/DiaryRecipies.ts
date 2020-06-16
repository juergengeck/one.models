import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        DiaryEntry: DiaryEntry;
    }

    export interface DiaryEntry {
        type: 'DiaryEntry';
        entry: string;
    }
}

const DiaryEntryRecipie: Recipe = {
    type: 'Recipe',
    name: 'DiaryEntry',
    rule: [
        {
            itemprop: 'entry',
            valueType: 'string'
        }
    ]
};

// Export recipies

const DiaryRecipes: Recipe[] = [DiaryEntryRecipie];

export default DiaryRecipes;
