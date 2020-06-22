import {AnyObject} from '@OneCoreTypes';
import {isFunction} from 'one.core/lib/util/type-checks-basic';
import {getInstanceIdHash, initInstance} from 'one.core/lib/instance';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {getObjectWithType} from 'one.core/lib/storage';
import {createMessageBus} from 'one.core/lib/message-bus';
import {default as WebSocket, MessageEvent} from 'ws';
import {start} from 'one.core/lib/logger';
import {InitialMessageType} from '../lib/misc/CommunicationServer';

start({includeInstanceName: true});

const MessageBus = createMessageBus('test:communication-server-bob');

let bobPublicKey: string;

function send(obj: AnyObject): void {
    if (!isFunction(process.send)) {
        throw new Error('process.send is not defined');
    }
    process.send(JSON.stringify(obj));
}

async function init(): Promise<void> {
    await initInstance({
        name: 'bob',
        email: 'bob',
        secret: 'bob'
    });

    const instanceIdHash = getInstanceIdHash();

    if (instanceIdHash !== undefined) {
        const instanceKeyLink = await getAllValues(instanceIdHash, true, 'Keys');
        const instancePubEncryptionKeys = await getObjectWithType(
            instanceKeyLink[0].toHash,
            'Keys'
        );
        bobPublicKey = instancePubEncryptionKeys.publicKey;
    }
    MessageBus.send('log', bobPublicKey);
}

function connect(otherInstancePubKey: string): void {
    // send register message to the communication server
    const connectMessage: InitialMessageType = {
        command: 'connect',
        pubKey: otherInstancePubKey
    };

    // create a web socket
    const webSocket = new WebSocket('ws://localhost:8000/');
    webSocket.onopen = async () => {
        await webSocket.send(JSON.stringify(connectMessage));
    };

    webSocket.onerror = (err) => MessageBus.send('log', 'web socket error:' + err);

    webSocket.onmessage = async (event: MessageEvent) => {
        MessageBus.send('log', 'response:' + event.data);
    };
}

process.on('message', (msg) => {
    MessageBus.send('log', 'Received message ' + JSON.stringify(msg.type));

    try {
        switch (msg.type) {
            case 'init': {
                init()
                    .then(() => send({id: msg.id}))
                    .catch((err) => {
                        MessageBus.send('error', err);
                        return send({id: msg.id, error: err});
                    });
                break;
            }
            case 'connect': {
                connect(msg.data);
                send({id: msg.id});
                break;
            }
            default: {
                console.error(`Unknown function ${msg.type}`);
            }
        }
    } catch (err) {
        MessageBus.send('error', err);
    }
});
