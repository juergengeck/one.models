import {Recipe, RecipeRule} from '@OneCoreTypes';
import {ORDERED_BY} from 'one.core/lib/recipes';
import {ValueRules} from './QuestionnaireRecipes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        QuestionnaireResponses: QuestionnaireResponses;
    }

    /**
     * An answer item in the questionnaire response
     */
    type QuestionnaireResponseItem = {
        linkId: string;
        answer: QuestionnaireValue[];
        item?: QuestionnaireResponseItem[];
    };

    /**
     * A single FHIR Questionnaire Response
     */
    type QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse';
        questionnaire?: string;
        status: 'in-progress' | 'completed' | 'amended' | 'entered-in-error' | 'stopped';
        item: QuestionnaireResponseItem[];
    };

    /**
     * Collection of Questionnaire Responses
     */
    export interface QuestionnaireResponses {
        $type$: 'QuestionnaireResponses';
        name?: string;
        type?: string;
        response: QuestionnaireResponse[];
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
    // Note: This is the 'url' field of the questionnaire being answered
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
        list: ORDERED_BY.APP,
        rule: [
            // FHIR(QuestionnaireResponse): Pointer to specific item from Questionnaire
            // Note: This links to the linkId of the specified questionnaire.
            {
                itemprop: 'linkId'
            },

            // FHIR(QuestionnaireResponse): The response(s) to the question
            {
                itemprop: 'answer',
                list: ORDERED_BY.APP,
                rule: ValueRules
            },

            // FHIR(QuestionnaireResponse): Nested questionnaire response items
            {
                itemprop: 'item',
                inheritFrom: 'QuestionnaireResponses.response.item',
                optional: true
            }
        ]
    }
];

const QuestionnaireResponsesRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'QuestionnaireResponses',
    rule: [
        // Here you can give the collection of responses a name
        // Some applications might use this for users to specify a name so they can
        // more easily find it again.
        {
            itemprop: 'name',
            optional: true
        },

        // Give this collection a type.
        // This is used by applications to e.g. give certain collections a special type
        // For one project, the type is something like 'initial questions', 'follow up' ...
        {
            itemprop: 'type',
            optional: true
        },

        // The responses
        {
            itemprop: 'response',
            list: ORDERED_BY.APP,
            rule: QuestionnaireResponseRules
        }
    ]
};

const QuestionnaireResponsesRecipes: Recipe[] = [QuestionnaireResponsesRecipe];

export default QuestionnaireResponsesRecipes;