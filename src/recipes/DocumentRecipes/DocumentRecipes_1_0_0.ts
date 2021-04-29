import type {BLOB, Recipe} from 'one.core/lib/recipes';
import type {SHA256Hash} from 'one.core/lib/util/type-checks';
export interface OneUnversionedObjectInterfaces {
    DocumentInfo: DocumentInfo;
}

export interface DocumentInfo {
    $type$: 'DocumentInfo';
    document: SHA256Hash<BLOB>;
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
