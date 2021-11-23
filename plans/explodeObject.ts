import type {WriteStorageApi} from '@refinio/one.core/lib/storage';
import {explode} from '@refinio/one.core/lib/microdata-exploder';

module.exports.createObjects = (WriteStorage: WriteStorageApi, obj: Array<string>) => {
    const objs = Array.isArray(obj) ? obj : [obj];

    return Promise.all(objs.map(microdata => explode(WriteStorage, microdata)));
};
