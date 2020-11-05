/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {closeInstance, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {expect} from 'chai';

import Recipes from '../lib/recipes/recipes';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';

let fileSystem;
let testModel;
describe('FilerModel model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false});
        await registerRecipes(Recipes);
        await importModules();
        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
        fileSystem = await model.filerModel.fs;
    });

    it('should see if the root was created', async () => {
        const result = await fileSystem.openDir('/');
        expect(result).to.not.be.equal(undefined);
    });
    it('should see if directories can be created and retrieved', async () => {
        const firstResult = await fileSystem.createDir('/', {
            $type$: 'FilerDirectory',
            path: '/dir1',
            files: [],
            children: []
        });
        const secondResult = await fileSystem.createDir(firstResult.path, {
            $type$: 'FilerDirectory',
            path: '/dir1/dir2',
            files: [],
            children: []
        });
        const thirdResult = await fileSystem.createDir('/dir1/dir2', {
            $type$: 'FilerDirectory',
            path: '/dir1/dir2/dir3',
            files: [],
            children: []
        });
        expect(firstResult).to.not.be.equal(undefined);
        expect(secondResult).to.not.be.equal(undefined);
        expect(thirdResult).to.not.be.equal(undefined);

        const firstRetrieveResult = await fileSystem.openDir('/dir1/dir2/dir3');
        const secondRetrieveResult = await fileSystem.openDir('/dir1/dir2');
        const thirdRetrieveResult = await fileSystem.openDir('/dir1');
        expect(firstRetrieveResult.path).to.be.equal('/dir1/dir2/dir3');
        expect(firstRetrieveResult.children.length).to.be.equal(0);

        expect(secondRetrieveResult.path).to.be.equal('/dir1/dir2');
        expect(secondRetrieveResult.children.length).to.be.equal(1);

        expect(thirdRetrieveResult.path).to.be.equal('/dir1');
        expect(thirdRetrieveResult.children.length).to.be.equal(1);

        const dirs = [];
        for (let i = 0; i < 100; i++) {
            dirs.push(`/con${i}`);
        }
        await Promise.all(
            dirs.map(async (dirName: string) => {
                const res = await fileSystem.createDir('/', {
                    $type$: 'FilerDirectory',
                    path: dirName,
                    files: [],
                    children: []
                });
                expect(res).to.not.be.equal(undefined);
            })
        );
        const rootRetrieveResult = await fileSystem.openDir('/');
        expect(rootRetrieveResult.path).to.be.equal('/');
        expect(rootRetrieveResult.children.length).to.be.equal(101);
    }).timeout(10000);
    it('should see if files can be created and retrieved', async () => {
        const firstResult = await fileSystem.createDir('/', {
            $type$: 'FilerDirectory',
            path: '/files',
            files: [],
            children: []
        });
        expect(firstResult).to.not.be.equal(undefined);
        const stream = createFileWriteStream();
        stream.write(new ArrayBuffer(64));
        const blob = await stream.end();
        const fileResult = await fileSystem.createFile('/files', blob.hash, 'newFile.txt');
        expect(fileResult.files.length).to.be.equal(1);

        const retrievedFileResult = await fileSystem.openFile('/files', 'newFile.txt');
        expect(retrievedFileResult).to.not.be.equal(undefined);
    });

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
        // await StorageTestInit.deleteTestDB();
    });
});
