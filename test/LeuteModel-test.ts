import {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import * as StorageTestInit from 'one.core/test/_helpers';
import {InstancesModel, LeuteModel} from '../lib/models';

/**
 * Promise wrapped timeout.
 * @param milis
 */
function promiseTimeout(milis: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), milis);
    });
}

describe('LeuteModel test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
    });

    it('should init module', async () => {
        const instancesModel = new InstancesModel();
        const leuteModel = new LeuteModel(instancesModel, 'localhost');
        await instancesModel.init('abc');
        await leuteModel.init();
        //console.log(await leuteModel.me());
        //console.log(await leuteModel.others());
        leuteModel.shutdown();
    });

    after(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });
});
