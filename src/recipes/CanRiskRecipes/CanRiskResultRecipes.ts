import type {OneUnversionedObjectInterfaces} from '@OneObjectInterfaces';
import CanRiskCanRiskResultRecipe_1_0_0 from './CanRiskResultRecipe_1_0_0.js';
import CanRiskCanRiskResultRecipe_1_0_1 from './CanRiskResultRecipe_1_0_1.js';
import type {Recipe} from '@refinio/one.core/lib/recipes.js';

const QuestionnaireRecipes: Recipe[] = [
    ...CanRiskCanRiskResultRecipe_1_0_0,
    ...CanRiskCanRiskResultRecipe_1_0_1
];
export default QuestionnaireRecipes;

export const latestVersionCanRiskResultType: keyof OneUnversionedObjectInterfaces =
    'CanRiskResult_1_0_1';
