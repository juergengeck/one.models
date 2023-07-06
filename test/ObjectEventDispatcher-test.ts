import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {wait} from '@refinio/one.core/lib/util/promise';
import {closeInstance, initInstance} from '@refinio/one.core/lib/instance';
import {expect} from 'chai';
import {SignatureReverseMaps} from '../lib/recipes/SignatureRecipes';
import {CertificateReverseMaps} from '../lib/recipes/Certificates/CertificateRecipes';
import ObjectEventDispatcher from '../lib/misc/ObjectEventDispatcher';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import RecipesStable from '../lib/recipes/recipes-stable';
import {DummyObjectRecipes} from './utils/createDummyObject';

describe('Object Event ispatcher test', () => {
    beforeEach(async () => {
        await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [...RecipesStable, ...RecipesExperimental, ...DummyObjectRecipes],
            initiallyEnabledReverseMapTypes: new Map([
                ...SignatureReverseMaps,
                ...CertificateReverseMaps
            ])
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Unversioned Object Test', async () => {
        const oed = new ObjectEventDispatcher();
        await oed.init();

        let callCount1 = 0;
        let callCount2 = 0;

        const d1 = oed.onUnversionedObject(async result => {
            ++callCount1;
        }, 'wait 1');
        const d2 = oed.onUnversionedObject(async result => {
            ++callCount2;
        }, 'wait 2');

        await storeUnversionedObject({
            $type$: 'DummyObjectUnversioned',
            data: 'Dooom'
        });
        await storeUnversionedObject({
            $type$: 'DummyObjectUnversioned',
            data: 'Dooom2'
        });
        await storeUnversionedObject({
            $type$: 'DummyObjectUnversioned',
            data: 'Dooom3'
        });
        await storeUnversionedObject({
            $type$: 'DummyObjectUnversioned',
            data: 'Dooom4'
        });

        await wait(1000);
        expect(callCount1).to.be.equal(4);
        expect(callCount2).to.be.equal(4);

        await oed.shutdown();
    });
});
