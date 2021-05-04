import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        AudioExercise: AudioExercise;
    }

    export interface AudioExercise {
        $type$: 'AudioExercise';
        name: string;
    }
}

export const AudioExerciseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AudioExercise',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string'
        }
    ]
};

// Export recipes

const AudioExerciseRecipes: Recipe[] = [AudioExerciseRecipe];

export default AudioExerciseRecipes;
