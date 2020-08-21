import {DemandMap} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, demandObj: DemandMap) => {
    return WriteStorage.storeVersionedObject(demandObj);
};
