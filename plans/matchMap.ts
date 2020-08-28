import {MatchMap} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, matchObj: MatchMap) => {
    return WriteStorage.storeVersionedObject(matchObj);
};
