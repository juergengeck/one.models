import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Feedback: Feedback;
    }

    export interface Feedback {
        $type$: 'Feedback';
        title: string;
        content: string;
    }
}

const FeedbackRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Feedback',
    rule: [
        {
            itemprop: 'title',
            valueType: 'string'
        },
        {
            itemprop: 'content',
            valueType: 'string'
        }
    ]
};

// Export recipes

const FeedbackRecipes: Recipe[] = [FeedbackRecipe];

export default FeedbackRecipes;
