import {closeInstance, initInstance} from '@refinio/one.core/lib/instance';
import SignatureRecipes, {SignatureReverseMaps} from '../lib/recipes/SignatureRecipes';
import CertificateRecipes, {
    CertificateReverseMaps
} from '../lib/recipes/Certificates/CertificateRecipes';
import {DummyObjectRecipes} from './utils/createDummyObject';
import {LeuteModel} from '../lib/models';
import LeuteRecipes from '../lib/recipes/Leute/recipes';
import InstancesRecipes from '../lib/recipes/InstancesRecipies';

describe('Keychains test', () => {
    let leute: LeuteModel;

    beforeEach(async () => {
        await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [
                ...CertificateRecipes,
                ...SignatureRecipes,
                ...DummyObjectRecipes,
                ...LeuteRecipes,
                ...InstancesRecipes
            ],
            initiallyEnabledReverseMapTypes: new Map([
                ...SignatureReverseMaps,
                ...CertificateReverseMaps
            ])
        });

        leute = new LeuteModel('ws://localhost:8000');
        await leute.init();
    });

    afterEach(async () => {
        await leute.shutdown();
        closeInstance();
    });

    it('Do stuff', async () => {
        //TBD
    });
});
