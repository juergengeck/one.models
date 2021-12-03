import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import CertificateRecipes from "../lib/recipes/CertificateRecipes";
import SignatureRecipes from "../lib/recipes/SignatureRecipes";
import MetaObjectMapRecipes from "../lib/recipes/MetaObjectMapRecipes";

describe('Certificate test', () => {

    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'testDb',
            initialRecipes: [...CertificateRecipes, ...SignatureRecipes, ...MetaObjectMapRecipes]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Affirm something myself', async () => {
    });
});
