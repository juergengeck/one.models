import {Recipe} from '@OneCoreTypes';
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
import DocumentRecipes from './DocumentRecipes/DocumentRecipes';

const RecipesStable: Recipe[] = [
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
    ...DocumentRecipes
];

export default RecipesStable;
