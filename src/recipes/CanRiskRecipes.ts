import type {Person, Recipe} from '@refinio/one.core/lib/recipes.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import {QuestionnaireResponsesType} from '../models/QuestionnaireModel.js';
import type {QuestionnaireResponses} from '../models/QuestionnaireModel.js';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        CanRiskResult: CanRiskResult;
    }
}

export interface CanRiskResult {
    $type$: 'CanRiskResult';
    result: string;
    ownerIdHash: SHA256IdHash<Person>;
    questionnaireResponsesHash: SHA256Hash<QuestionnaireResponses>;
}

export const CanRiskResultRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'CanRiskResult',
    rule: [
        {
            itemprop: 'ownerIdHash', // patientId
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'questionnaireResponsesHash',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set([QuestionnaireResponsesType])}
        },
        {
            itemprop: 'result',
            itemtype: {type: 'string'}
        }
    ]
};

const CanRiskRecipes: Recipe[] = [CanRiskResultRecipe];

export default CanRiskRecipes;
