import LeuteRecipesCE from './CommunicationEndpoints';
import LeuteRecipesLeute from './Leute';
import LeuteRecipesPD from './PersonDescriptions';
import LeuteRecipesProfile from './Profile';
import LeuteRecipesSomeone from './Someone';

export default [
    ...LeuteRecipesCE,
    ...LeuteRecipesLeute,
    ...LeuteRecipesPD,
    ...LeuteRecipesProfile,
    ...LeuteRecipesSomeone
];
