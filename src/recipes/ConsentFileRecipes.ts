import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        ConsentFile: ConsentFile;
        DropoutFile: DropoutFile;
    }

    export interface ConsentFile {
        $type$: 'ConsentFile';
        personId: SHA256IdHash<Person>;
        version?: string;
    }

    export interface DropoutFile {
        $type$: 'DropoutFile';
        personId: SHA256IdHash<Person>;
        reason: string;
        date: string;
    }
}

const ConsentFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ConsentFile',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person'])
        },
        {
            itemprop: 'version',
            valueType: 'string',
            optional: true
        }
    ]
};

const DropoutFileRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DropoutFile',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person'])
        },
        {
            itemprop: 'reason',
            valueType: 'string'
        },
        {
            itemprop: 'date',
            valueType: 'string'
        }
    ]
};

// Export recipes

const ConsentFile: Recipe[] = [ConsentFileRecipe,DropoutFileRecipe];

export default ConsentFile;
