import CommunicationServer from './CommunicationServer';
import {getInstanceIdHash, initInstance} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {getObjectWithType} from 'one.core/lib/storage';
import {InitialMessageType} from '../../lib/misc/CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';
import {toByteArray, fromByteArray} from 'base64-js';
import {decryptWithPublicKey} from 'one.core/lib/instance-crypto';
import {decryptSecretKey} from 'one.core/lib/instance-crypto';

let communicationServer: CommunicationServer;

async function main(): Promise<void> {
    const secret = 'test';
    let instancePublicKey: string = '';
    // start the communication server
    communicationServer = new CommunicationServer();
    await communicationServer.start('localhost', 8000);

    // initialising the instance
    await initInstance({
        name: 'test',
        email: 'test',
        secret
    });

    const instanceId = await getInstanceIdHash();
    let instancePrivateKey: Uint8Array | null = null;

    if (instanceId) {
        const instanceKeyLink = await getAllValues(instanceId, true, 'Keys');
        const instancePubEncryptionKeys = await getObjectWithType(
            instanceKeyLink[0].toHash,
            'Keys'
        );
        // remember instance public and private key for sending it to the communication server
        instancePublicKey = instancePubEncryptionKeys.publicKey;

        instancePrivateKey = await decryptSecretKey(
            secret,
            `${instanceKeyLink[instanceKeyLink.length - 1].toHash}.instance.encrypt`
        );
    }

    // send register message to the communication server
    const registerMessage: InitialMessageType = {
        command: 'register',
        pubKey: instancePublicKey
    };

    // create a web socket
    const webSocket = new WebSocket('ws://localhost:8000/');
    webSocket.onopen = async () => {
        await webSocket.send(JSON.stringify(registerMessage));
    };

    webSocket.onerror = (err) => console.log('web socket error:' + err);

    webSocket.onmessage = async (event: MessageEvent) => {
        console.log('response:' + event.data);
        const message = JSON.parse(event.data as string) as InitialMessageType;
        if (
            message.command === 'authenticate' &&
            message.response &&
            instancePrivateKey &&
            message.pubKey
        ) {
            const receivedString = decryptWithPublicKey(
                toByteArray(message.pubKey),
                toByteArray(message.response),
                instancePrivateKey
            );
            const authenticationMessage: InitialMessageType = {
                command: 'authenticate',
                pubKey: instancePublicKey,
                response: fromByteArray(receivedString)
            };
            await webSocket.send(JSON.stringify(authenticationMessage));
        }
    };
}

main().catch(async (err) => {
    console.error('main error' + err);
    // eslint-disable-next-line no-console
    console.log('Communication Server Client ERROR!');
    await communicationServer.stop();
    process.exit(1);
});
