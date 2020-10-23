/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers.js';
import Recipes from '../lib/recipes/recipes';
import {Electrocardiogram} from '@OneCoreTypes';
import TestModel, {dbKey, importModules} from './utils/TestModel';
import ECGModel from '../lib/models/ECGModel';
let ecgModel: ECGModel;

describe('ECG Model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes(Recipes);
        await importModules();
        const model = new TestModel('ws://localhost:8000', './test/testDB');
        await model.init(undefined);
        ecgModel = model.ecgModel;
    });

    it('Should create an ECG with 15000 readings', async () => {
        const readings = [];
        for (let i = 0; i < 15000; i++) {
            readings.push({timeSinceSimpleStart: i, leadVoltage: Math.random()});
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
        closeInstance();
        await StorageTestInit.deleteTestDB();
    });
});
