import LeuteRecipesCE from './CommunicationEndpoints';
import LeuteRecipesLeute from './Leute';
import LeuteRecipesPD from './PersonDescriptions';
import LeuteRecipesProfile from './Profile';
import LeuteRecipesSomeone from './Someone';
import LeuteRecipesGroupProfile from './GroupProfile';

export default [
    ...LeuteRecipesCE,
    ...LeuteRecipesLeute,
    ...LeuteRecipesPD,
    ...LeuteRecipesProfile,
    ...LeuteRecipesSomeone,
    ...LeuteRecipesGroupProfile
];
