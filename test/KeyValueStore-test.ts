import path from 'path';
import fs from 'fs';
import rimraf from 'rimraf';
const TEST_BASE_DIR = path.join(process.cwd(), 'storage');
import {expect} from 'chai';
import {KeyValueStore} from '../lib/misc/stores';

const store = KeyValueStore

describe('Misc - KeyValueStorage', () => {
    before(function (done) {
        fs.mkdir(TEST_BASE_DIR, {recursive: true}, done);
        store.setItem('test$first-key', 'test$first-value');
    });

    after(function (done) {
        rimraf(TEST_BASE_DIR, done);
    });

    it('Should getItem()', () => {
        expect(store.getItem('test$first-key')).to.be.equal('test$first-value');
    });
    it('Should setItem()', () => {
        store.setItem('test$key', 'test$value');
        expect(store.getItem('test$key')).to.be.equal('test$value');
    });
    it('Should key()', () => {
        expect(store.key(0)).to.be.equal('test$first-key');
    });
    it('Should length()', () => {
        expect(store.length).to.be.equal(2);
    });
    it('Should removeItem()', () => {
        store.removeItem('test$key');
        expect(store.getItem('test$key')).to.be.equal(null);
    });
    it('Should overwrite first item', () => {
        store.setItem('test$first-key', 'test$new-value');
        expect(store.getItem('test$first-key')).to.be.equal('test$new-value');
    });
    it('Should write json as value', () => {
        store.setItem('test$second-key', JSON.stringify({testStr: 'test', testNum: 2}));
        expect(store.getItem('test$second-key')).to.be.equal('{"testStr":"test","testNum":2}');
    });
    it('Should overwrite previous key and write list as value', () => {
        store.setItem('test$second-key', JSON.stringify([1, 2, 3, 4, 5, 6]));
        expect(store.getItem('test$second-key')).to.be.equal('[1,2,3,4,5,6]');
    });
    it('Should clear storage', () => {
        store.clear();
        expect(store.key(0)).to.be.equal(null);
    });
    it('Should add 20 items and retrieve the key of the last one', () => {
        for(let i = 0; i < 20; i++){
            store.setItem(`key#${i}`, JSON.stringify(i));
            expect(store.getItem(`key#${i}`)).to.be.equal(JSON.stringify(i));
        }
        expect(store.length).to.be.equal(20);

        expect(store.key(19)).to.be.equal('key#19')
    });
    it('Should clear storage again', () => {
        store.clear();
        expect(store.key(0)).to.be.equal(null);
    });
});
