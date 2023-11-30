import type {OneUnversionedObjectInterfaces} from '@OneObjectInterfaces';
import CanRiskCanRiskResultRecipe_1_0_0 from './CanRiskResultRecipe_1_0_0.js';
import CanRiskCanRiskResultRecipe_1_0_1 from './CanRiskResultRecipe_1_0_1.js';
import CanRiskCanRiskResultRecipe_1_0_2 from './CanRiskResultRecipe_1_0_2.js';
import type {OneObjectTypeNames, Recipe} from '@refinio/one.core/lib/recipes.js';

const QuestionnaireRecipes: Recipe[] = [
    ...CanRiskCanRiskResultRecipe_1_0_0,
    ...CanRiskCanRiskResultRecipe_1_0_1,
    ...CanRiskCanRiskResultRecipe_1_0_2
];
export default QuestionnaireRecipes;

export const latestVersionCanRiskResult: keyof OneUnversionedObjectInterfaces =
    'CanRiskResult_1_0_2';

export type {CanRiskResult_1_0_2 as CanRiskResult} from './CanRiskResultRecipe_1_0_2.js';

const supported = ['CanRiskResult_1_0_1', 'CanRiskResult_1_0_2'] as const;
export const canRiskResultVersions: (keyof OneUnversionedObjectInterfaces)[] = [...supported];
export const canRiskResultVersionsTypes: OneObjectTypeNames[] = [...supported];
export type CanRiskResultVersionsType = (typeof supported)[number];
