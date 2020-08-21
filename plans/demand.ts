import {Demand} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, demandObj: Demand) => {
    return WriteStorage.storeUnversionedObject(demandObj);
};
