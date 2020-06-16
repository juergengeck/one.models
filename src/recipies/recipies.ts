import {Recipe} from '@OneCoreTypes';
import BodyTemperatureRecipies from './BodyTemperatureRecipies';
import ChannelRecipies from './ChannelRecipies';
import ContactRecipies from './ContactRecipies';
import DiaryRecipies from './DiaryRecipies';
import MetaRecipies from './MetaRecipies';
import QuestionnaireRecipies from './QuestionnaireRecipies';
import ConsentFileRecipies from './ConsentFileRecipies';
import SettingsRecipe from './SettingsRecipe';

const Recipes: Recipe[] = [
    ...BodyTemperatureRecipies,
    ...ChannelRecipies,
    ...ContactRecipies,
    ...DiaryRecipies,
    ...MetaRecipies,
    ...QuestionnaireRecipies,
    ...ConsentFileRecipies,
    ...SettingsRecipe
];

export default Recipes;
