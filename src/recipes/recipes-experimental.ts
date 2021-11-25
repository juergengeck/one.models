import type {Recipe} from '@refinio/one.core/lib/recipes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import ECGRecipes from './ECGRecipes';
import BloodGlucoseRecipes from './BloodGlucoseRecipes';
import AudioExerciseRecipes from './AudioExerciseRecipes';
import LeuteRecipes from './Leute/recipes';
import CertificateRecipes from './CertificateRecipes';
import ChatRecipes from './ChatRecipes';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...BloodGlucoseRecipes,
    ...AudioExerciseRecipes,
    ...CertificateRecipes,
    ...LeuteRecipes,
    ...ChatRecipes
];

export default RecipesExperimental;
