import {RequestCatalog} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, requestCatalog: RequestCatalog) => {
    return WriteStorage.storeUnversionedObject(requestCatalog);
};
