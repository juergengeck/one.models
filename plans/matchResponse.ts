import {MatchResponse} from '@OneCoreTypes';
import {WriteStorageApi} from 'one.core/lib/storage';

module.exports.createObjects = (WriteStorage: WriteStorageApi, matchResponse: MatchResponse) => {
    return WriteStorage.storeUnversionedObject(matchResponse);
};
