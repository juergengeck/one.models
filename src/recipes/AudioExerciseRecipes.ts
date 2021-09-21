import type {Recipe} from 'one.core/lib/recipes';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        AudioExercise: AudioExercise;
    }
}

export interface AudioExercise {
    $type$: 'AudioExercise';
    name: string;
}

export const AudioExerciseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AudioExercise',
    rule: [
        {
            itemprop: 'name',
            itemtype: {type: 'string'}
        }
    ]
};

const AudioExerciseRecipes: Recipe[] = [AudioExerciseRecipe];

export default AudioExerciseRecipes;
