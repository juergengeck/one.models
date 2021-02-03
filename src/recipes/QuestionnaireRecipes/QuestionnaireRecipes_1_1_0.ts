import {Recipe, RecipeRule} from '@OneCoreTypes';
import {
    CodingRules,
    QuestionnaireRules as QuestionnaireRules_1_0_0
} from './QuestionnaireRecipes_1_0_0';
import {addRule, cloneRule, overwriteRule} from '../RecipeUtils';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Questionnaire_1_1_0: Questionnaire_1_1_0;
    }

    /**
     * FHIR Questionnaire type
     */
    export interface Questionnaire_1_1_0 extends Omit<Questionnaire, '$type$' | 'item'> {
        $type$: 'Questionnaire_1_1_0';
        item: Questionnaire_1_1_0.Question[];
    }

    module Questionnaire_1_1_0 {

        /**
         * Question of a questionnaire.
         */
        type Question = Questionnaire.Question & {
            answerRestriction?: AnswerRestriction;
        };

        /**
         * Used to specify min and max value for an answer.
         */
        type QuestionnaireAnswerMinMaxValue = {
            valueInteger?: string;
            valueDate?: string; // can also be 'now'
            valueTime?: string;
            valueString?: string;
            valueCoding?: Coding;
        };

        /**
         * Represents the restriction that will be applied to an answer.
         */
        type AnswerRestriction = {
            minValue?: QuestionnaireAnswerMinMaxValue;
            minInclusive?: boolean; // default = true
            maxValue?: QuestionnaireAnswerMinMaxValue;
            maxInclusive?: boolean; // default = true
        };

        /**
         * FHIR Coding type for encoding coded values.
         */
        type Coding = Questionnaire.Coding;

        /**
         * Type for the enable when compare value of questionnaires.
         */
        type QuestionnaireEnableWhenAnswer = Questionnaire.QuestionnaireEnableWhenAnswer;

        /**
         * Type for answer option values of questionnaires.
         */
        type QuestionnaireAnswerOptionValue = Questionnaire.QuestionnaireEnableWhenAnswer;

        /**
         * Type of questionnaire answers and initial values.
         */
        type QuestionnaireValue = Questionnaire.QuestionnaireValue;
    }
}

/**
 * Values for custom extension to specify restrictions on answers
 */
export const QuestionnaireAnswerMinMaxValueRule: RecipeRule[] = [
    {
        itemprop: 'valueInteger',
        regexp: /[0]|[-+]?[1-9][0-9]*/,
        optional: true
    },
    {
        itemprop: 'valueDate',
        regexp: /([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?/,
        optional: true
    },
    {
        itemprop: 'valueTime',
        regexp: /([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?/,
        optional: true
    },
    {
        itemprop: 'valueString',
        optional: true
    },
    {
        itemprop: 'valueCoding',
        rule: CodingRules,
        optional: true
    }
];

/**
 * Custom extension to specify restrictions on answers
 */
export const AnswerRestrictionRule: RecipeRule[] = [
    {
        itemprop: 'minValue',
        rule: QuestionnaireAnswerMinMaxValueRule,
        optional: true
    },
    {
        itemprop: 'minInclusive',
        valueType: 'boolean',
        optional: true
    },
    {
        itemprop: 'maxValue',
        rule: QuestionnaireAnswerMinMaxValueRule,
        optional: true
    },
    {
        itemprop: 'maxInclusive',
        valueType: 'boolean',
        optional: true
    }
];

/**
 * The rules to build a questionnaire based on FHIR
 */
export const QuestionnaireRules: RecipeRule[] = cloneRule(QuestionnaireRules_1_0_0);
overwriteRule(QuestionnaireRules, 'item', {
    itemprop: 'item',
    inheritFrom: 'Questionnaire_1_1_0.item',
    optional: true
});

addRule(QuestionnaireRules, 'item', {
    itemprop: 'answerRestriction',
    rule: AnswerRestrictionRule,
    optional: true
});

/**
 * Recipe for questionnaires based upon FHIR standard.
 *
 * @type {{name: string; rule: RecipeRule[]; $type$: string}}
 */
export const QuestionnaireRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Questionnaire_1_1_0',
    rule: QuestionnaireRules
};

const QuestionnaireRecipes: Recipe[] = [QuestionnaireRecipe];
export default QuestionnaireRecipes;
