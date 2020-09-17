import {NotifiedUsers} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, object: NotifiedUsers) => {
    return WriteStorage.storeVersionedObject(object);
};
