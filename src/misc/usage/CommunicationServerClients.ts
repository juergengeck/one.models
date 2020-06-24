import {InitialMessageType} from '../CommunicationServer';
import {default as WebSocket, MessageEvent} from 'ws';
import {createMessageBus} from 'one.core/lib/message-bus';
import CommunicationServerConnector from '../CommunicationServerConnector';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';
import {fromByteArray, toByteArray} from 'base64-js';

const MessageBus = createMessageBus('CommunicationServerConnectClient');
const MessageBusConnector = createMessageBus('CommunicationServerConnectorClient');
const MessageBusPassive = createMessageBus('CommunicationServerPassiveClient');

const communicationServerURL: string = 'ws://localhost:8000/';

export async function connectToOtherClient(otherClientPubKey: string): Promise<void> {
    // send register message to the communication server
    const connectMessage: InitialMessageType = {
        command: 'connect',
        pubKey: otherClientPubKey
    };

    // create a web socket
    const webSocket = new WebSocket(communicationServerURL);
    webSocket.onopen = async () => {
        await webSocket.send(JSON.stringify(connectMessage));
    };

    webSocket.onerror = (err) => console.error('web socket error:' + err);

    webSocket.onmessage = async (event: MessageEvent) => {
        const message = JSON.parse(event.data as string) as InitialMessageType;
        if (message.command === 'connect') {
            MessageBus.send('log', 'Connection established.');

            const testMessage: InitialMessageType = {
                command: 'message',
                response: 'Test message to other client.'
            };
            await webSocket.send(JSON.stringify(testMessage));
        }
        if (message.command === 'message') {
            MessageBus.send('log', 'message received:' + message.response);

            if (process.send) {
                process.send('message received');
            }
        }
    };
}

export async function registerClientAndWaitConnectionsWithConnector(
    instancePublicKey: string,
    instancePrivateKey: string
): Promise<void> {
    const communicationServerConnector = new CommunicationServerConnector(1);

    communicationServerConnector.onConnection = (webSocket: WebSocket) => {
        MessageBusConnector.send('log', 'Connection established.');
        const testMessage: InitialMessageType = {
            command: 'message',
            response: 'Test message to no-connector client.'
        };
        webSocket.send(JSON.stringify(testMessage));

        webSocket.onmessage = (event: MessageEvent) => {
            MessageBusConnector.send('log', 'Message received:', event.data);

            if (process.send) {
                process.send('message received');
            }
        };
    };
    communicationServerConnector.onChallenge = (message, serverPubKey) => {
        MessageBusConnector.send('log', 'onChallenge');

        const receivedString = decryptWithPublicKey(
            toByteArray(serverPubKey),
            toByteArray(message),
            toByteArray(instancePrivateKey)
        );
        const reEncryptedString = encryptWithPublicKey(
            toByteArray(serverPubKey),
            receivedString,
            toByteArray(instancePrivateKey)
        );
        return fromByteArray(reEncryptedString);
    };

    await communicationServerConnector.register(communicationServerURL, instancePublicKey);
}

export async function registerClientAndWaitConnections(
    instancePublicKey: string,
    instancePrivateKey: string
): Promise<void> {
    // send register message to the communication server
    const registerMessage: InitialMessageType = {
        command: 'register',
        pubKey: instancePublicKey
    };

    // create a web socket
    const webSocket = new WebSocket(communicationServerURL);
    webSocket.onopen = async () => {
        await webSocket.send(JSON.stringify(registerMessage));
    };

    webSocket.onerror = (err) => console.error('web socket error:' + err);

    webSocket.onmessage = async (event: MessageEvent) => {
        const message = JSON.parse(event.data as string) as InitialMessageType;
        if (
            message.command === 'authenticate' &&
            message.response &&
            instancePrivateKey &&
            message.pubKey
        ) {
            MessageBusPassive.send('log', 'authentication started');

            const receivedString = decryptWithPublicKey(
                toByteArray(message.pubKey),
                toByteArray(message.response),
                toByteArray(instancePrivateKey)
            );
            const reEncryptedString = encryptWithPublicKey(
                toByteArray(message.pubKey),
                receivedString,
                toByteArray(instancePrivateKey)
            );
            const authenticationMessage: InitialMessageType = {
                command: 'authenticate',
                pubKey: instancePublicKey,
                response: fromByteArray(reEncryptedString)
            };
            await webSocket.send(JSON.stringify(authenticationMessage));
        }

        if (message.command === 'connect') {
            MessageBusPassive.send('log', 'Connection established.');

            const testMessage: InitialMessageType = {
                command: 'message',
                response: 'Test message to active client.'
            };
            await webSocket.send(JSON.stringify(testMessage));
        }

        if (message.command === 'message') {
            MessageBusPassive.send('log', 'message received:' + message.response);

            if (process.send) {
                process.send('message received');
            }
        }
    };
}
