import {closeInstance, initInstance} from '@refinio/one.core/lib/instance';
import SignatureRecipes, {SignatureReverseMaps} from '../lib/recipes/SignatureRecipes';
import CertificateRecipes, {CertificateReverseMaps} from '../lib/recipes/CertificateRecipes';
import {DummyObjectRecipes} from './utils/createDummyObject';
import {LeuteModel} from '../src/models';
import InstancesModel from '../src/models/InstancesModel';
import LeuteRecipes from '../src/recipes/Leute/recipes';
import InstancesRecipes from '../src/recipes/InstancesRecipies';

describe('Certificate test', () => {
    let instances: InstancesModel;
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

        instances = new InstancesModel();
        leute = new LeuteModel(instances, 'ws://localhost:8000');

        await instances.init();
        await leute.init();
    });

    afterEach(async () => {
        await leute.shutdown();
        await instances.shutdown();
        closeInstance();
    });

    it('Create signatures', async () => {});
});
