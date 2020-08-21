import {SupplyMap} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, supplyObj: SupplyMap) => {
    return WriteStorage.storeVersionedObject(supplyObj);
};
