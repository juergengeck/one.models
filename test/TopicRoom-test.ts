import {expect} from 'chai';
import {readFile} from 'fs/promises';
import * as StorageTestInit from './_helpers';
import TestModel, {importModules} from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import path from 'path';
import {statSync} from 'fs';
import TopicModel from '../lib/models/Chat/TopicModel';
import TopicRoom from '../lib/models/Chat/TopicRoom';

let testModel: TestModel;
let topicRoom: TopicRoom;
let topicModel: TopicModel;

function buildTestFile(): File {
    const filePath = './test/consent.pdf';
    const stats = statSync(filePath);

    // @ts-ignore enough for the test
    return {
        lastModified: stats.ctimeMs,
        name: path.basename(filePath),
        size: stats.size,
        type: 'application/pdf',
        arrayBuffer: () => readFile(filePath)
    };
}

describe('Consent', () => {
    before(async () => {
        await StorageTestInit.init();
        await importModules();
        const model = new TestModel('ws://localhost:8000');
        await model.init(undefined);
        testModel = model;

        // Prep to the topic room
        topicModel = new TopicModel(testModel.channelManager);
        await topicModel.init();
        const everyoneTopic = await topicModel.createEveryoneTopic();
        topicRoom = new TopicRoom(everyoneTopic, testModel.channelManager);
    });
    after(async () => {
        await testModel.shutdown();
        await topicModel;
        await closeAndDeleteCurrentInstance();
    });

    it('should receive a message', async function () {
        const messagePromise = new Promise(resolve => {
            topicRoom.onNewMessageReceived(msg => resolve(msg));
        });

        await topicRoom.sendMessage('muhahaha');
        const message = await messagePromise;

        console.log(message);
    });
});
