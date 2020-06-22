import {initInstance} from 'one.core/lib/instance';
import {InitialMessageType} from '../../lib/misc/CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';

async function main(): Promise<void> {
    // const otherInstancePublicKey = getOtherInstancePublicKey();

    // initialising the instance
    await initInstance({
        name: 'test2',
        email: 'test2',
        secret: 'test2'
    });

    // send register message to the communication server
    const connectMessage: InitialMessageType = {
        command: 'connect',
        pubKey: 'pubKey.'
    };

    // create a web socket
    const webSocket = new WebSocket('ws://localhost:8000/');
    webSocket.onopen = async () => {
        await webSocket.send(JSON.stringify(connectMessage));
    };

    webSocket.onerror = (err) => console.log('web socket error:' + err);

    webSocket.onmessage = async (event: MessageEvent) => {
        console.log('response:' + event.data);
    };
}

main().catch(async (err) => {
    console.error('main error' + err);
    // eslint-disable-next-line no-console
    console.log('Communication Server Client ERROR!');
    process.exit(1);
});
