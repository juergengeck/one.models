import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import MetaObjectMapRecipes from '../lib/recipes/MetaObjectMapRecipes';
import {
    addMetaObject,
    getMetaObjectHashesOfType,
    getMetaObjectsOfType,
    useExperimentalReverseMaps
} from '../lib/misc/MetaObjectMap';
import {
    createDummyObjectUnversioned,
    createDummyObjectVersioned,
    DummyObjectRecipes
} from './utils/createDummyObject';

describe('MetaObjectMap test', () => {
    beforeEach(async () => {
        useExperimentalReverseMaps(true);
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [...DummyObjectRecipes, ...MetaObjectMapRecipes]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Create and retrieve metamap objects', async () => {
        const me = getInstanceOwnerIdHash();

        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const result1 = await createDummyObjectUnversioned('t1');
        const result2 = await createDummyObjectUnversioned('t2');
        const idResult1 = await createDummyObjectVersioned('i1', 't3');

        await addMetaObject(me, result1.hash);
        await addMetaObject(me, result2.hash);
        await addMetaObject(me, idResult1.hash);

        const unv = await getMetaObjectsOfType(me, 'DummyObjectUnversioned');
        const unvHashes = await getMetaObjectHashesOfType(me, 'DummyObjectUnversioned');
        const v = await getMetaObjectsOfType(me, 'DummyObjectVersioned');
        const vHashes = await getMetaObjectHashesOfType(me, 'DummyObjectVersioned');

        expect(unv.length).to.be.equal(2);
        expect(unvHashes.length).to.be.equal(2);
        expect(v.length).to.be.equal(1);
        expect(vHashes.length).to.be.equal(1);

        expect(unv.map(x => x.data)).to.have.members(['t1', 't2']);
        expect(unvHashes).to.have.members([result1.hash, result2.hash]);
        expect(v[0].id).to.be.equal('i1');
        expect(v[0].data).to.be.equal('t3');
        expect(vHashes[0]).to.be.equal(idResult1.hash);
    });
});
