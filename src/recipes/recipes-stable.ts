import type {Recipe} from '@refinio/one.core/lib/recipes.js';
import ChannelRecipes from './ChannelRecipes.js';
import DiaryRecipes from './DiaryRecipes.js';
import MetaRecipes from './MetaRecipes.js';
import QuestionnaireRecipes from './QuestionnaireRecipes/QuestionnaireRecipes.js';
import QuestionnaireResponseRecipes from './QuestionnaireRecipes/QuestionnaireResponseRecipes.js';
import QuestionnaireResponseRecipes_2_0_0 from './QuestionnaireRecipes/QuestionnaireResponseRecipes_2_0_0.js';
import SettingsRecipe from './SettingsRecipe.js';
import NewsRecipes from './NewsRecipes.js';
import InstancesRecipes from './InstancesRecipies.js';
import DocumentRecipes from './DocumentRecipes/DocumentRecipes.js';
import HeartEventRecipes from './HeartEventRecipes.js';

const RecipesStable: Recipe[] = [
    ...ChannelRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...QuestionnaireResponseRecipes,
    ...QuestionnaireResponseRecipes_2_0_0,
    ...SettingsRecipe,
    ...InstancesRecipes,
    ...DocumentRecipes,
    ...HeartEventRecipes
];

export default RecipesStable;
