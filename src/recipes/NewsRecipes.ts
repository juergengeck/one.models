import type {Recipe} from 'one.core/lib/recipes';
declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        News: News;
    }
}

export interface News {
    $type$: 'News';
    content: string;
}

export const NewsRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'News',
    rule: [
        {
            itemprop: 'content',
            valueType: 'string'
        }
    ]
};

// Export recipes

const NewsRecipes: Recipe[] = [NewsRecipe];

export default NewsRecipes;
