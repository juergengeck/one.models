import type {Recipe} from '@refinio/one.core/lib/recipes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import ECGRecipes from './ECGRecipes';
import BloodGlucoseRecipes from './BloodGlucoseRecipes';
import PersistentFileSystemRecipes from './PersistentFileSystemRecipes';
import AudioExerciseRecipes from './AudioExerciseRecipes';
import LeuteRecipes from './Leute/recipes';
import CertificateRecipes from './Certificates/CertificateRecipes';
import SignatureRecipes from './SignatureRecipes';
import ChatRecipes from './ChatRecipes';
import ConsentRecipes from './ConsentRecipes';
import IoMRequestRecipes from './IoM/IoMRequest';
import IoMRequestsRegistryRecipes from './IoM/IoMRequestsRegistry';

const RecipesExperimental: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...ECGRecipes,
    ...BloodGlucoseRecipes,
    ...PersistentFileSystemRecipes,
    ...AudioExerciseRecipes,
    ...CertificateRecipes,
    ...ChatRecipes,
    ...LeuteRecipes,
    ...SignatureRecipes,
    ...ConsentRecipes,
    ...IoMRequestRecipes,
    ...IoMRequestsRegistryRecipes
];

export default RecipesExperimental;
