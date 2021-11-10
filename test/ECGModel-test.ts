/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from '@refinio/one.core/lib/instance';
import * as StorageTestInit from '@refinio/one.core/test/_helpers.js';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import type ECGModel from '../lib/models/ECGModel';
import type {Electrocardiogram} from '../lib/recipes/ECGRecipes';

let ecgModel: ECGModel;
let testModel: TestModel;

describe('ECG Model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
        ecgModel = model.ecgModel;
    });

    it('Should create an ECG with 15000 readings', async () => {
        const readings = [];
        for (let i = 0; i < 15000; i++) {
            readings.push({timeSinceSampleStart: i, leadVoltage: Math.random()});
        }
        const ECG: Electrocardiogram = {
            $type$: 'Electrocardiogram',
            voltageMeasurements: 0,
            readings: readings
        };

        await ecgModel.postECG(ECG);
        const electrocardiograms = await ecgModel.retrieveAllWithoutData();
        let result = await ecgModel.retrieveECGReadings(electrocardiograms[0].dataHash);
        expect(result.readings.length).to.be.equal(100);
        while (result.nextFrom) {
            result = await ecgModel.retrieveECGReadings(
                electrocardiograms[0].dataHash,
                result.nextFrom
            );
            expect(result.readings.length).to.be.equal(result.nextFrom ? 100 : 99);
        }
    }).timeout(4000);

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });
});
