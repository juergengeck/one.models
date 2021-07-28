import type {Recipe} from 'one.core/lib/recipes';
import ChannelRecipes from './ChannelRecipes';
import DiaryRecipes from './DiaryRecipes';
import MetaRecipes from './MetaRecipes';
import QuestionnaireRecipes from './QuestionnaireRecipes/QuestionnaireRecipes';
import QuestionnaireResponseRecipes from './QuestionnaireRecipes/QuestionnaireResponseRecipes';
import ConsentFileRecipes from './ConsentFileRecipes';
import SettingsRecipe from './SettingsRecipe';
import NewsRecipes from './NewsRecipes';
import InstancesRecipes from './InstancesRecipies';
import DocumentRecipes from './DocumentRecipes/DocumentRecipes';
import HeartEventRecipes from './HeartEventRecipes';

const RecipesStable: Recipe[] = [
    ...ChannelRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...QuestionnaireResponseRecipes,
    ...ConsentFileRecipes,
    ...SettingsRecipe,
    ...InstancesRecipes,
    ...DocumentRecipes,
    ...HeartEventRecipes
];

export default RecipesStable;
