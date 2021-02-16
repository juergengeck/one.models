import {Recipe} from '@OneCoreTypes';

enum MimeType {
    JPEG = 'image/jpeg',
    PNG = 'image/png',
    PDF = 'application/pdf'
}

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        DocumentInfo_1_1_0: DocumentInfo_1_1_0;
    }

    export interface DocumentInfo_1_1_0 extends Omit<DocumentInfo, '$type$'> {
        $type$: 'DocumentInfo_1_1_0';
        mimeType: MimeType;
    }
}

const DocumentInfoRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DocumentInfo',
    rule: [
        {
            itemprop: 'document',
            referenceToBlob: true
        },
        {
            itemprop: 'mimeType',
            valueType: 'string'
        }
    ]
};

// Export recipes

const DocumentRecipes: Recipe[] = [DocumentInfoRecipe];

export default DocumentRecipes;
