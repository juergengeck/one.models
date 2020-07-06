import {Recipe} from '@OneCoreTypes';
import BodyTemperatureRecipes from './BodyTemperatureRecipies';
import ChannelRecipes from './ChannelRecipies';
import ContactRecipes from './ContactRecipies';
import DiaryRecipes from './DiaryRecipies';
import MetaRecipes from './MetaRecipies';
import QuestionnaireRecipes from './QuestionnaireRecipies';
import ConsentFileRecipes from './ConsentFileRecipies';
import SettingsRecipe from './SettingsRecipe';
import NewsRecipes from "./NewsRecipes";

const Recipes: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...ChannelRecipes,
    ...ContactRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...ConsentFileRecipes,
    ...SettingsRecipe
];

export default Recipes;
