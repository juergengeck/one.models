import {Recipe, RecipeRule} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {ValueRules} from "./QuestionnaireRecipes";

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        QuestionnaireResponse: QuestionnaireResponse;
        QuestionnaireResponses: QuestionnaireResponses;
    }

    export interface QuestionnaireResponses {
        $type$: 'QuestionnaireResponses',
        responses: QuestionnaireResponse[];
    }

    export interface QuestionnaireResponse {
        questionnaireId: string;
        answers: {
            linkId: string;
            answer_text: string;
            answer_code: string;
        }[];
    }
}

/**
 * The rules to build a questionnaire based on FHIR
 */
const QuestionnaireResponseRules: RecipeRule[] = [
    // FHIR ressource type
    {
        itemprop: 'resourceType',
        regexp: /QuestionnaireResponse/
    },

    // FHIR(QuestionnaireResponse): Form being answered
    // Note: This is the 'url' fielt of the questionnaire beign answered
    {
        itemprop: 'questionnaire',
        optional: true
    },

    // FHIR(QuestionnaireResponse): in-progress | completed | amended | entered-in-error | stopped - QuestionnaireResponseStatus (Required)
    {
        itemprop: 'status',
        regexp: /in-progress|completed|amended|entered-in-error|stopped/
    },

    // FHIR(QuestionnaireResponse): Groups and questions
    // + Rule: Nested item can't be beneath both item and answer
    {
        itemprop: 'item',
        list: ORDERED_BY.ONE,
        rule: [

            // FHIR(QuestionnaireResponse): Pointer to specific item from Questionnaire
            // Note: This links to the linkId of the specified questionnaire.
            {
                itemprop: 'linkId'
            },

            // FHIR(QuestionnaireResponse): The response(s) to the question
            {
                itemprop: 'answer',
                list: ORDERED_BY.ONE,
                rule: ValueRules
            }
        ]
    }
];

const QuestionnaireResponsesRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'QuestionnaireResponses',
    rule: [
        {
            itemprop: 'responses',
            list: ORDERED_BY.ONE,
            rule: QuestionnaireResponseRules
        }
    ]
}

const QuestionnaireResponsesRecipes: Recipe[] = [QuestionnaireResponsesRecipe];

export default QuestionnaireResponsesRecipes;
