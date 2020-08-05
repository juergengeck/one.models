import {Recipe} from '@OneCoreTypes';
import BodyTemperatureRecipes from './BodyTemperatureRecipe';
import ChannelRecipes from './ChannelRecipes';
import ContactRecipes from './ContactRecipes';
import DiaryRecipes from './DiaryRecipes';
import MetaRecipes from './MetaRecipes';
import QuestionnaireRecipes from './QuestionnaireRecipes';
import ConsentFileRecipes from './ConsentFileRecipes';
import SettingsRecipe from './SettingsRecipe';
import NewsRecipes from './NewsRecipes';
import SliderRecipes from './SliderRecipies';

const Recipes: Recipe[] = [
    ...BodyTemperatureRecipes,
    ...ChannelRecipes,
    ...ContactRecipes,
    ...NewsRecipes,
    ...DiaryRecipes,
    ...MetaRecipes,
    ...QuestionnaireRecipes,
    ...ConsentFileRecipes,
    ...SettingsRecipe,
    ...SliderRecipes
];

export default Recipes;
