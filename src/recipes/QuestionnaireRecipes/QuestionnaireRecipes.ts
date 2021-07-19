import QuestionnaireRecipes_1_0_0 from './QuestionnaireRecipes_1_0_0';
import QuestionnaireRecipes_1_1_0 from './QuestionnaireRecipes_1_1_0';
import type {Recipe} from 'one.core/lib/recipes';

const QuestionnaireRecipes: Recipe[] = [
    ...QuestionnaireRecipes_1_0_0,
    ...QuestionnaireRecipes_1_1_0
];
export default QuestionnaireRecipes;
