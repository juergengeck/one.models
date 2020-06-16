import {WriteStorageApi} from 'one.core/lib/storage';
import {explode} from 'one.core/lib/microdata-exploder';

module.exports.createObjects = (WriteStorage: WriteStorageApi, obj: Array<string>) => {
    const objs = Array.isArray(obj) ? obj : [obj];

    return Promise.all(objs.map((microdata) => explode(WriteStorage, microdata)));
};
