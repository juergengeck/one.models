import type {OneUnversionedObjectInterfaces} from '@OneObjectInterfaces';
import QuestionnaireResponseRecipes_1_0_0 from './QuestionnaireResponseRecipes_1_0_0.js';
import QuestionnaireResponseRecipes_2_0_0 from './QuestionnaireResponseRecipes_2_0_0.js';
import type {OneObjectTypeNames, Recipe} from '@refinio/one.core/lib/recipes.js';

const QuestionnaireResponseRecipes: Recipe[] = [
    ...QuestionnaireResponseRecipes_1_0_0,
    ...QuestionnaireResponseRecipes_2_0_0
];
export default QuestionnaireResponseRecipes;

export const supportedQuestionnaireResponseVersions: (keyof OneUnversionedObjectInterfaces)[] = [
    'QuestionnaireResponses',
    'QuestionnaireResponses_2_0_0'
];

export const supportedQuestionnaireResponseVersionsTypes: OneObjectTypeNames[] = [
    'QuestionnaireResponses',
    'QuestionnaireResponses_2_0_0'
];
