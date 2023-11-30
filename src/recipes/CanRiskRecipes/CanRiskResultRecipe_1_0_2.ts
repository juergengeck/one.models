import type {Person, Recipe} from '@refinio/one.core/lib/recipes.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {QuestionnaireResponsesHash} from '../QuestionnaireRecipes/QuestionnaireResponseRecipes.js';
import {QuestionnaireResponsesVersionsTypes} from '../QuestionnaireRecipes/QuestionnaireResponseRecipes.js';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        CanRiskResult_1_0_2: CanRiskResult_1_0_2;
    }
}

export interface CanRiskResult_1_0_2 {
    $type$: 'CanRiskResult_1_0_2';
    result: string;
    ownerIdHash: SHA256IdHash<Person>;
    questionnaireResponsesHash: QuestionnaireResponsesHash;
}

export const CanRiskResultRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'CanRiskResult_1_0_2',
    rule: [
        {
            itemprop: 'ownerIdHash', // patientId
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'questionnaireResponsesHash',
            itemtype: {
                type: 'referenceToObj',
                allowedTypes: new Set(QuestionnaireResponsesVersionsTypes)
            }
        },
        {
            itemprop: 'result',
            itemtype: {type: 'string'}
        }
    ]
};

const CanRiskRecipes: Recipe[] = [CanRiskResultRecipe];

export default CanRiskRecipes;
