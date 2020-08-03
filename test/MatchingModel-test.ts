import Model, {importModules} from "./utils/Model";
import {Recipes} from "one.match/lib/recipes";
import {initInstance} from "one.core/lib/instance";

const matchingModel = new Model().match;

describe('test sendSupplyToMatch', function() {
    before(async function () {
        await initInstance({
            name: 'instanceName',
            email: 'instanceName',
            secret: '1234',
            ownerName: 'instanceName',
            initialRecipes: Recipes,
            initiallyEnabledReverseMapTypes: new Map([['Instance', new Set(['owner'])]])
        });
        await importModules();
    });
    it('should test init() function on a fresh instance', async () => {
        await matchingModel.init();
    });
})
