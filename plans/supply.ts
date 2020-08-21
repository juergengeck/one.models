import {Supply} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, supplyObj: Supply) => {
    return WriteStorage.storeUnversionedObject(supplyObj);
};
