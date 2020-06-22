import CommunicationServer, {InitialMessageType} from '../lib/misc/CommunicationServer';
import {createMessageBus} from 'one.core/lib/message-bus';
import {ChildProcess, fork} from 'child_process';
import {AnyFunction} from '@OneCoreTypes';
import {isObject} from 'one.core/lib/util/type-checks-basic';
import {getInstanceIdHash, initInstance} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {getObjectWithType} from 'one.core/lib/storage';
import {default as WebSocket, MessageEvent} from 'ws';
import {start} from 'one.core/lib/logger';
import {fromByteArray, toByteArray} from 'base64-js';
import {decryptSecretKey, decryptWithPublicKey} from 'one.core/lib/instance-crypto';
import {expect} from 'chai';

start({includeInstanceName: true});

const MessageBus = createMessageBus('test:communication-server-alice');

describe('communication server Alice test', () => {
    let communicationServer: CommunicationServer;

    let BobsProcess: ChildProcess;
    const requests: Map<number, [AnyFunction, AnyFunction]> = new Map();
    let requestId = 0;

    function sendToBob(type: string, data?: any): any {
        return new Promise((resolve, reject) => {
            MessageBus.send('log', 'sendToBob ' + type);
            BobsProcess.send({
                type,
                id: requestId,
                data
            });
            requests.set(requestId, [resolve, reject]);
            requestId += 1;
        });
    }

    function forkBob(): void {
        MessageBus.send('log', 'forks Bob');
        BobsProcess = fork('./test/CommunicationServer-bob-test.js');
        BobsProcess.on('message', (json: string): void => {
            const msg = JSON.parse(json);
            const [resolve, reject] = requests.get(msg.id) || [undefined, undefined];

            if (!resolve || !reject) {
                throw new Error('No resolve or reject (undefined), id: ' + msg.id);
            }

            if (isObject(msg.error)) {
                reject(msg.error);
            } else {
                resolve(msg.data);
            }
            requests.delete(msg.id);
        });
    }

    before(async () => {
        forkBob();

        await initInstance({
            name: 'alice',
            email: 'alice',
            secret: 'alice'
        });

        try {
            await sendToBob('init');
        } catch (err) {
            MessageBus.send('error', err);
        }

        communicationServer = new CommunicationServer();
        await communicationServer.start('localhost', 8000);
    });

    it('should establish a connection between two instances', async function test() {
        // eslint-disable-next-line no-invalid-this
        this.timeout(100000);

        let connected = false;

        const aliceInstanceId = await getInstanceIdHash();
        let alicePublicKey: string = '';
        let alicePrivateKey: Uint8Array | null = null;

        if (aliceInstanceId) {
            const instanceKeyLink = await getAllValues(aliceInstanceId, true, 'Keys');
            const instancePubEncryptionKeys = await getObjectWithType(
                instanceKeyLink[0].toHash,
                'Keys'
            );
            alicePublicKey = instancePubEncryptionKeys.publicKey;

            alicePrivateKey = await decryptSecretKey(
                'alice',
                `${instanceKeyLink[instanceKeyLink.length - 1].toHash}.instance.encrypt`
            );
        }

        const registerMessage: InitialMessageType = {
            command: 'register',
            pubKey: alicePublicKey
        };

        const webSocket = new WebSocket('ws://localhost:8000/');
        webSocket.onopen = async () => {
            await webSocket.send(JSON.stringify(registerMessage));
        };
        await webSocket.onopen;
        webSocket.onerror = (err) => MessageBus.send('error', err);

        webSocket.onmessage = async (event: MessageEvent) => {
            MessageBus.send('log', 'response:' + event.data);
            const message = JSON.parse(event.data as string) as InitialMessageType;
            if (
                message.command === 'authenticate' &&
                message.response &&
                alicePrivateKey &&
                message.pubKey
            ) {
                const receivedString = decryptWithPublicKey(
                    toByteArray(message.pubKey),
                    toByteArray(message.response),
                    alicePrivateKey
                );
                const authenticationMessage: InitialMessageType = {
                    command: 'authenticate',
                    pubKey: alicePublicKey,
                    response: fromByteArray(receivedString)
                };
                await webSocket.send(JSON.stringify(authenticationMessage));
            }
            if (message.command === 'connect') {
                MessageBus.send('log', 'Connected with other instance.');
                connected = true;
            }
        };

        await sendToBob('connect', alicePublicKey);

        setTimeout(() => {
            expect(connected).to.be.equal(true);
        }, 10000);
    });

    after(async () => {
        MessageBus.send('log', 'communication server Alice test - Cleaning up');
        BobsProcess.disconnect();
        await communicationServer.stop();
    });
});
