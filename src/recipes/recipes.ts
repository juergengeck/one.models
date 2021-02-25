import {Recipe} from '@OneCoreTypes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import ChannelRecipes from './ChannelRecipes';
import ContactRecipes from './ContactRecipes';
import DiaryRecipes from './DiaryRecipes';
import MetaRecipes from './MetaRecipes';
import QuestionnaireRecipes from './QuestionnaireRecipes/QuestionnaireRecipes';
import QuestionnaireResponseRecipes from './QuestionnaireRecipes/QuestionnaireResponseRecipes';
import ConsentFileRecipes from './ConsentFileRecipes';
import SettingsRecipe from './SettingsRecipe';
import NewsRecipes from './NewsRecipes';
import InstancesRecipes from './InstancesRecipies';
import BlobRecipes from './BlobRecipes';
import MatchingRecipes from './MatchingRecipes';
import WbcRecipes from './WbcDiffRecipes';
import DocumentRecipes from './DocumentRecipes/DocumentRecipes';
import ECGRecipes from './ECGRecipes';

const Recipes: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...ChannelRecipes,
    ...ContactRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...QuestionnaireResponseRecipes,
    ...ConsentFileRecipes,
    ...SettingsRecipe,
    ...InstancesRecipes,
    ...BlobRecipes,
    ...MatchingRecipes,
    ...WbcRecipes,
    ...DocumentRecipes,
    ...ECGRecipes
];

export default Recipes;
