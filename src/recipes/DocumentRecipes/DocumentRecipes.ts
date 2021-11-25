import DocumentRecipes_1_0_0 from './DocumentRecipes_1_0_0';
import DocumentRecipes_1_1_0 from './DocumentRecipes_1_1_0';
import type {Recipe} from '@refinio/one.core/lib/recipes';
const DocumentRecipes: Recipe[] = [...DocumentRecipes_1_0_0, ...DocumentRecipes_1_1_0];
export default DocumentRecipes;
