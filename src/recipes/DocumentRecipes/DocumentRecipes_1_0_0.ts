import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        DocumentInfo: DocumentInfo;
    }

    export interface DocumentInfo {
        $type$: 'DocumentInfo';
        document: SHA256Hash<BLOB>;
    }
}

const DocumentInfoRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DocumentInfo',
    rule: [
        {
            itemprop: 'document',
            referenceToBlob: true
        }
    ]
};

// Export recipes

const DocumentRecipes: Recipe[] = [DocumentInfoRecipe];

export default DocumentRecipes;
