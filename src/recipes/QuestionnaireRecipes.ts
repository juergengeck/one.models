import {Recipe} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        QuestionnaireResponse: QuestionnaireResponse;
    }

    export interface QuestionnaireResponse {
        $type$: 'QuestionnaireResponse';
        questionnaire: string;
        item: {
            linkId: string;
            answer: string;
        }[];
        isComplete: boolean;
    }
}

const QuestionnaireResponseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'QuestionnaireResponse',
    rule: [
        {
            itemprop: 'questionnaire',
            valueType: 'string'
        },
        {
            itemprop: 'item',
            list: ORDERED_BY.ONE,
            rule: [
                {
                    itemprop: 'linkId',
                    valueType: 'string'
                },
                {
                    itemprop: 'answer',
                    valueType: 'string'
                }
            ]
        },
        {
            itemprop: 'isComplete',
            valueType: 'boolean'
        }
    ]
};

// Export recipes

const QuestionnaireRecipes: Recipe[] = [QuestionnaireResponseRecipe];

export default QuestionnaireRecipes;
