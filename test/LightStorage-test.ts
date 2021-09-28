import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
const TEST_BASE_DIR = path.join(__dirname, '/storage-dirs');
import {expect} from 'chai';
import {LightStorage} from '../lib/misc/lightStorage';

const storage = LightStorage

describe('Misc - KeyValueStorage', () => {
    before(function (done) {
        fs.mkdir(TEST_BASE_DIR, {recursive: true}, done);
        storage.setItem('test$first-key', 'test$first-value');
    });

    after(function (done) {
        rimraf(TEST_BASE_DIR, done);
    });

    it('Should getItem()', () => {
        expect(storage.getItem('test$first-key')).to.be.equal('test$first-value');
    });
    it('Should setItem()', () => {
        storage.setItem('test$key', 'test$value');
        expect(storage.getItem('test$key')).to.be.equal('test$value');
    });
    it('Should key()', () => {
        expect(storage.key(0)).to.be.equal('test$first-key');
    });
    it('Should length()', () => {
        expect(storage.length).to.be.equal(2);
    });
    it('Should removeItem()', () => {
        storage.removeItem('test$key');
        expect(storage.getItem('test$key')).to.be.equal(null);
    });
    it('Should overwrite first item', () => {
        storage.setItem('test$first-key', 'test$new-value');
        expect(storage.getItem('test$first-key')).to.be.equal('test$new-value');
    });
    it('Should write json as value', () => {
        storage.setItem('test$second-key', JSON.stringify({testStr: 'test', testNum: 2}));
        expect(storage.getItem('test$second-key')).to.be.equal('{"testStr":"test","testNum":2}');
    });
    it('Should overwrite previous key and write list as value', () => {
        storage.setItem('test$second-key', JSON.stringify([1, 2, 3, 4, 5, 6]));
        expect(storage.getItem('test$second-key')).to.be.equal('[1,2,3,4,5,6]');
    });
    it('Should clear storage', () => {
        storage.clear();
        expect(storage.key(0)).to.be.equal(null);
    });
    it('Should add 20 items and retrieve the key of the last one', () => {
        for(let i = 0; i < 20; i++){
            storage.setItem(`key#${i}`, JSON.stringify(i));
            expect(storage.getItem(`key#${i}`)).to.be.equal(JSON.stringify(i));
        }
        expect(storage.length).to.be.equal(20);

        expect(storage.key(19)).to.be.equal('key#19')
    });
    it('Should clear storage again', () => {
        storage.clear();
        expect(storage.key(0)).to.be.equal(null);
    });
});
