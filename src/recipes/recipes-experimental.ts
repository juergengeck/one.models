import type {Recipe} from 'one.core/lib/recipes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import ECGRecipes from './ECGRecipes';
import BloodGlucoseRecipes from './BloodGlucoseRecipes';
import AudioExerciseRecipes from './AudioExerciseRecipes';
import LeuteRecipes from './LeuteRecipes';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...BloodGlucoseRecipes,
    ...AudioExerciseRecipes,
    ...LeuteRecipes
];

export default RecipesExperimental;
