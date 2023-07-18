import type {Recipe} from '@refinio/one.core/lib/recipes.js';
import BodyTemperatureRecipes from './BodyTemperatureRecipe.js';
import BlobRecipes from './BlobRecipes.js';
import MatchingRecipes from './MatchingRecipes.js';
import WbcRecipes from './WbcDiffRecipes.js';
import ECGRecipes from './ECGRecipes.js';
import BloodGlucoseRecipes from './BloodGlucoseRecipes.js';
import PersistentFileSystemRecipes from './PersistentFileSystemRecipes.js';
import AudioExerciseRecipes from './AudioExerciseRecipes.js';
import LeuteRecipes from './Leute/recipes.js';
import Certificates from './Certificates/CertificateRecipes.js';
import SignatureRecipes from './SignatureRecipes.js';
import ChatRecipes from './ChatRecipes.js';
import ConsentRecipes from './ConsentRecipes.js';
import IoMRequestRecipes from './IoM/IoMRequest.js';
import IoMRequestsRegistryRecipes from './IoM/IoMRequestsRegistry.js';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...BloodGlucoseRecipes,
    ...PersistentFileSystemRecipes,
    ...AudioExerciseRecipes,
    ...Certificates,
    ...ChatRecipes,
    ...LeuteRecipes,
    ...SignatureRecipes,
    ...ConsentRecipes,
    ...IoMRequestRecipes,
    ...IoMRequestsRegistryRecipes
];

export default RecipesExperimental;
