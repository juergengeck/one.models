import type {Recipe} from 'one.core/lib/recipes';
import ChannelRecipes from './ChannelRecipes';
import ContactRecipes from './ContactRecipes';
import DiaryRecipes from './DiaryRecipes';
import MetaRecipes from './MetaRecipes';
import QuestionnaireRecipes from './QuestionnaireRecipes/QuestionnaireRecipes';
import QuestionnaireResponseRecipes from './QuestionnaireRecipes/QuestionnaireResponseRecipes';
import SettingsRecipe from './SettingsRecipe';
import NewsRecipes from './NewsRecipes';
import InstancesRecipes from './InstancesRecipies';
import DocumentRecipes from './DocumentRecipes/DocumentRecipes';
import HeartEventRecipes from './HeartEventRecipes';

const RecipesStable: Recipe[] = [
    ...ChannelRecipes,
    ...ContactRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...QuestionnaireResponseRecipes,
    ...SettingsRecipe,
    ...InstancesRecipes,
    ...DocumentRecipes,
    ...HeartEventRecipes
];

export default RecipesStable;
