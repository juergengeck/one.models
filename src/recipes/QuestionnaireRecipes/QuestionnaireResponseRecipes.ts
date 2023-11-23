import QuestionnaireResponseRecipes_1_0_0 from './QuestionnaireResponseRecipes_1_0_0.js';
import QuestionnaireResponseRecipes_2_0_0 from './QuestionnaireResponseRecipes_2_0_0.js';
import type {Recipe} from '@refinio/one.core/lib/recipes.js';

const QuestionnaireResponseRecipes: Recipe[] = [
    ...QuestionnaireResponseRecipes_1_0_0,
    ...QuestionnaireResponseRecipes_2_0_0
];
export default QuestionnaireResponseRecipes;
