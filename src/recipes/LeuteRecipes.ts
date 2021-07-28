import LeuteRecipesCE from './LeuteRecipes/CommunicationEndpoints';
import LeuteRecipesLeute from './LeuteRecipes/Leute';
import LeuteRecipesPD from './LeuteRecipes/PersonDescriptions';
import LeuteRecipesProfile from './LeuteRecipes/Profile';
import LeuteRecipesSomeone from './LeuteRecipes/Someone';

export default [
    ...LeuteRecipesCE,
    ...LeuteRecipesLeute,
    ...LeuteRecipesPD,
    ...LeuteRecipesProfile,
    ...LeuteRecipesSomeone
];
