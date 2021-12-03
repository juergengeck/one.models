import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import CertificateRecipes from "../lib/recipes/CertificateRecipes";
import SignatureRecipes from "../lib/recipes/SignatureRecipes";
import MetaObjectMapRecipes from "../lib/recipes/MetaObjectMapRecipes";
import {affirm, isAffirmedBy} from "../lib/misc/Certificate";
import {createDummyObjectUnversioned, DummyObjectRecipes} from "./utils/createDummyObject";

describe('Certificate test', () => {

    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'testDb',
            initialRecipes: [...CertificateRecipes, ...SignatureRecipes, ...MetaObjectMapRecipes, ...DummyObjectRecipes]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Affirm something myself', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const data = (await createDummyObjectUnversioned('bla')).hash;

        expect(await isAffirmedBy(me, data)).to.be.false;
        await affirm(data);
        expect(await isAffirmedBy(me, data)).to.be.true;
    });
});
