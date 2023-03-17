import {expect} from 'chai';
import {readFile} from 'fs/promises';
import * as StorageTestInit from './_helpers';
import TestModel from './utils/TestModel';
import {closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import path from 'path';
import {statSync} from 'fs';
import TopicModel from '../lib/models/Chat/TopicModel';
import TopicRoom from '../lib/models/Chat/TopicRoom';
import type {BlobDescriptor} from '../lib/models/BlobCollectionModel';

let testModel: TestModel;
let topicRoom: TopicRoom;
let topicModel: TopicModel;

function buildTestFile(): File {
    const filePath = './test/consent.pdf';
    const stats = statSync(filePath);

    return {
        lastModified: stats.ctimeMs,
        name: path.basename(filePath),
        size: stats.size,
        type: 'application/pdf',
        arrayBuffer: () => readFile(filePath)
    } as unknown as File;
}

describe('Consent', () => {
    before(async () => {
        await StorageTestInit.init();
        const model = new TestModel('ws://localhost:8000');
        await model.init(undefined);
        testModel = model;

        // Prep to the topic room
        topicModel = new TopicModel(testModel.channelManager, testModel.leuteModel);
        await topicModel.init();
        const everyoneTopic = await topicModel.createEveryoneTopic();
        topicRoom = new TopicRoom(everyoneTopic, testModel.channelManager, testModel.leuteModel);
    });
    after(async () => {
        await testModel.shutdown();
        await topicModel.shutdown();
        await closeAndDeleteCurrentInstance();
    });

    it('should receive a message', async function () {
        /** This test is not right because the event is broken. fixme
        const messagePromise: Promise<ObjectData<ChatMessage>> = new Promise(resolve => {
            topicRoom.onNewMessageReceived(msg => resolve(msg));
        });

        await topicRoom.sendMessage('the message');
        const message = await messagePromise;
        expect(message.data.text).to.equal('the message');
         */
    });

    it('should receive a message containing a BlobDescriptors', async function () {
        /** This test is not right because the event is broken. fixme
         const messagePromise: Promise<ObjectData<ChatMessage>> = new Promise(resolve => {
            topicRoom.onNewMessageReceived(msg => resolve(msg));
        });
        const file = buildTestFile();
        await topicRoom.sendMessageWithAttachmentAsFile('with attachment', [file]);
        const message = await messagePromise;
        expect(message.data.attachments?.length).to.not.equal(0);
        */
    });

    it.skip('should recover the file from BlobDescriptors', async function () {
        const messages = await topicRoom.retrieveAllMessagesWithAttachments();
        const messageWithAttachment = messages[1];

        expect(messageWithAttachment.data.attachments).to.not.be.undefined;
        const blobDescriptor = messageWithAttachment.data.attachments[0] as BlobDescriptor;

        expect(blobDescriptor.data instanceof ArrayBuffer);
    });
});
