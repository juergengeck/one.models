import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Slider: Slider;
    }

    export interface Slider {
        $type$: 'Slider';
        items: ArrayBuffer[];
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
