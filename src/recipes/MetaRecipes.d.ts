import type { OneUnversionedObjectTypes, Recipe } from 'one.core/lib/recipes';
import type { SHA256Hash } from 'one.core/lib/util/type-checks';
declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        CreationTime: CreationTime;
    }
}
export interface CreationTime {
    $type$: 'CreationTime';
    timestamp: number;
    data: SHA256Hash<OneUnversionedObjectTypes>;
}
declare const MetaRecipes: Recipe[];
export default MetaRecipes;
//# sourceMappingURL=MetaRecipes.d.ts.map