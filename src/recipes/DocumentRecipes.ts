import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        DocumentInfo: DocumentInfo;
    }

    export interface DocumentInfo {
        $type$: 'DocumentInfo';
        document: File;
    }
}

const DocumentInfoRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DocumentInfo',
    rule: [
        {
            itemprop: 'document',
            valueType: 'object'
        }
    ]
};

// Export recipes

const DocumentRecipes: Recipe[] = [DocumentInfoRecipe];

export default DocumentRecipes;
