import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        DiaryEntry: DiaryEntry;
    }

    export interface DiaryEntry {
        $type$: 'DiaryEntry';
        entry: string;
    }
}

const DiaryEntryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DiaryEntry',
    rule: [
        {
            itemprop: 'entry',
            valueType: 'string'
        }
    ]
};

// Export recipes

const DiaryRecipes: Recipe[] = [DiaryEntryRecipe];

export default DiaryRecipes;
