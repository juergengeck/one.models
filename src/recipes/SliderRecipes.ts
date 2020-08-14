import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Slider: Slider;
    }

    export interface Slider {
        $type$: 'Slider';
        items: SHA256Hash<BLOB>[];
    }
}

export const SliderRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Slider',
    rule: [
        {
            itemprop: 'items',
            list: 'orderedByONE',
            referenceToBlob: true
        }
    ]
};

export const SliderRecipes: Recipe[] = [SliderRecipe];

export default SliderRecipes;
