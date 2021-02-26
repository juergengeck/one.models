/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers.js';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import {Electrocardiogram} from '@OneCoreTypes';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import ECGModel from '../lib/models/ECGModel';
import rimraf from 'rimraf';
let ecgModel: ECGModel;
let testModel;

describe('ECG Model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
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
        const electrocardiograms = await ecgModel.retrieveAll();
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
