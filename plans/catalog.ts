import {Catalog} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, catalog: Catalog) => {
    return WriteStorage.storeVersionedObject(catalog);
};

