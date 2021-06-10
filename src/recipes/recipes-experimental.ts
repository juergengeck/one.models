import {Recipe} from '@OneCoreTypes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import ECGRecipes from './ECGRecipes';
import PersistentFileSystemRecipes from './PersistentFileSystemRecipes';
import AudioExerciseRecipes from './AudioExerciseRecipes';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...PersistentFileSystemRecipes,
    ...AudioExerciseRecipes
];

export default RecipesExperimental;
