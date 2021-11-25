import type {Recipe} from '@refinio/one.core/lib/recipes';

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        ConsentFile: ConsentFile;
    }
}

export interface ConsentFile {
    $type$: 'ConsentFile';
    fileData: string;
    fileType: string;
}

const ConsentFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ConsentFile',
    rule: [
        {
            itemprop: 'fileData',
            itemtype: {type: 'string'}
        },
        {
            itemprop: 'fileType',
            itemtype: {type: 'string'}
        }
    ]
};

const ConsentFile: Recipe[] = [ConsentFileRecipe];

export default ConsentFile;
