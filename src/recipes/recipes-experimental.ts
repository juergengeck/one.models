import type {Recipe} from 'one.core/lib/recipes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import ECGRecipes from './ECGRecipes';
import BloodGlucoseRecipes from './BloodGlucoseRecipes';
import AudioExerciseRecipes from './AudioExerciseRecipes';
import LeuteRecipes from './Leute/recipes';
import CertificateRecipes from './CertificateRecipes';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...BloodGlucoseRecipes,
    ...AudioExerciseRecipes,
    ...CertificateRecipes,
    ...LeuteRecipes
];

export default RecipesExperimental;
