import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        ConsentFile: ConsentFile;
    }

    export interface ConsentFile {
        $type$: 'ConsentFile';
        fileData: string;
        fileType: string;
    }
}

const ConsentFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ConsentFile',
    rule: [
        {
            itemprop: 'fileData',
            valueType: 'string'
        },
        {
            itemprop: 'fileType',
            valueType: 'string'
        }
    ]
};

// Export recipes

const ConsentFile: Recipe[] = [ConsentFileRecipe];

export default ConsentFile;