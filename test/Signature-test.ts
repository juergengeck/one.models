import {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance';
import * as StorageTestInit from './_helpers';
import {expect} from 'chai';
import {getMetaObjectHashesOfType, getMetaObjectsOfType, storeMetaObject} from "../lib/misc/MetaObjectMap";
import {storeUnversionedObject} from "@refinio/one.core/lib/storage-unversioned-objects";
import {sign, signedBy} from "../lib/misc/Signature";

describe('Certificate test', () => {

    beforeEach(async () => {
        await StorageTestInit.init({
            dbKey: dbKey,
            deleteDb: false
        });
        await importModules();
    });

    afterEach(async () => {
        try {
            closeInstance();
        } finally {
            await removeDir(`./test/${dbKey}`);
        }
    });


    it('Sign object by me', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const result1 = await storeUnversionedObject({
            $type$: 'Plan',
            parameters: 'dummy1',
            moduleName: 'dummy2'
        });

        /*const result2 = await storeUnversionedObject({
            $type$: 'Plan',
            parameters: 'dummy2',
            moduleName: 'dummy3'
        });*/

        const signPersons1 = await signedBy(result1.hash);
        expect(signPersons1.length).to.be.equal(0);

        await sign(result1.hash);

        const signPersons2 = await signedBy(result1.hash);
        expect(signPersons2.length).to.be.equal(1);
        expect(signPersons2[0]).to.be.equal(me);
    });
});
