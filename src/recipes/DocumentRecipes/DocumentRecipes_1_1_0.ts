import type {Recipe} from 'one.core/lib/recipes';
import {DocumentInfo} from './DocumentRecipes_1_0_0';
export enum AcceptedMimeType {
    JPEG = 'image/jpeg',
    PNG = 'image/png',
    PDF = 'application/pdf'
}

export interface OneUnversionedObjectInterfaces {
    DocumentInfo_1_1_0: DocumentInfo_1_1_0;
}

export interface DocumentInfo_1_1_0 extends Omit<DocumentInfo, '$type$'> {
    $type$: 'DocumentInfo_1_1_0';
    mimeType: string;
    documentName: string;
}

const DocumentInfoRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DocumentInfo_1_1_0',
    rule: [
        {
            itemprop: 'document',
            referenceToBlob: true
        },
        {
            itemprop: 'mimeType',
            valueType: 'string'
        },
        {
            itemprop: 'documentName',
            valueType: 'string'
        }
    ]
};

// Export recipes

const DocumentRecipes: Recipe[] = [DocumentInfoRecipe];

export default DocumentRecipes;
