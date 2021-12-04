import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import {getMetaObjectHashesOfType, getMetaObjectsOfType, storeMetaObject} from "../lib/misc/MetaObjectMap";
import MetaObjectMapRecipes from "../lib/recipes/MetaObjectMapRecipes";

describe('MetaObjectMap test', () => {

    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'testDb',
            initialRecipes: [...MetaObjectMapRecipes]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Create and retrieve metamap objects', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const result1 = await storeMetaObject(me, {
            $type$: 'Keys',
            owner: me,
            publicKey: '0000000000000000000000000000000000000000000='
        });

        const result2 = await storeMetaObject(me, {
            $type$: 'Keys',
            owner: me,
            publicKey: '0000000000000000000000000000000000000000001='
        });

        const result3 = await storeMetaObject(me, {
            $type$: 'Plan',
            parameters: 'dummy3',
            moduleName: 'dummy4'
        });

        const keys = await getMetaObjectsOfType(me, 'Keys');
        const keyHashes = await getMetaObjectHashesOfType(me, 'Keys');
        const plans = await getMetaObjectsOfType(me, 'Plan');
        const planHashes = await getMetaObjectHashesOfType(me, 'Plan');

        expect(keys.length).to.be.equal(2);
        expect(keyHashes.length).to.be.equal(2);
        expect(plans.length).to.be.equal(1);
        expect(planHashes.length).to.be.equal(1);

        expect(keys[0].publicKey).to.be.equal('0000000000000000000000000000000000000000000=');
        expect(keys[1].publicKey).to.be.equal('0000000000000000000000000000000000000000001=');
        expect(keyHashes[0]).to.be.equal(result1.hash);
        expect(keyHashes[1]).to.be.equal(result2.hash);
        expect(plans[0].parameters).to.be.equal('dummy3');
        expect(plans[0].moduleName).to.be.equal('dummy4');
        expect(planHashes[0]).to.be.equal(result3.hash);
    });
});
