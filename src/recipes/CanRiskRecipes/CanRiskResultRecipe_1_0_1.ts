import type {Person, Recipe} from '@refinio/one.core/lib/recipes.js';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        CanRiskResult_1_0_1: CanRiskResult_1_0_1;
    }
}

export interface CanRiskResult_1_0_1 {
    $type$: 'CanRiskResult_1_0_1';
    result: string;
    ownerIdHash: SHA256IdHash<Person>;
    questionnaireResponsesHash: 'QuestionnaireResponses';
}

export const CanRiskResultRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'CanRiskResult_1_0_1',
    rule: [
        {
            itemprop: 'ownerIdHash', // patientId
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'questionnaireResponsesHash',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['QuestionnaireResponses'])}
        },
        {
            itemprop: 'result',
            itemtype: {type: 'string'}
        }
    ]
};

const CanRiskRecipes: Recipe[] = [CanRiskResultRecipe];

export default CanRiskRecipes;
