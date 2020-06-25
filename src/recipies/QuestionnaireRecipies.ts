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
    }
}

const QuestionnaireResponseRecipie: Recipe = {
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
        }
    ]
};

// Export recipies

const QuestionnaireRecipies: Recipe[] = [QuestionnaireResponseRecipie];

export default QuestionnaireRecipies;
