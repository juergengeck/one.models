import CommunicationServer from '../lib/misc/CommunicationServer';
import CommunicationServerListener, {
    CommunicationServerListenerState
} from '../lib/misc/CommunicationServerListener';
import WebSocketPromiseBased from '../lib/misc/WebSocketPromiseBased';
import {decryptWithPublicKey, encryptWithPublicKey} from '@refinio/one.core/lib/instance-crypto';
import tweetnacl from 'tweetnacl';
import WebSocketWS from 'isomorphic-ws';
import {expect} from 'chai';
import {wait} from '@refinio/one.core/lib/util/promise';
import {createWebSocket} from '@refinio/one.core/lib/system/websocket';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';

import * as Logger from '@refinio/one.core/lib/logger';
Logger.start();

/**
 * Test for testing the communication server.
 *
 * TODO: As you can see it is quite an effort to setup a simple connection for talking to the comm server.
 *       The reason seems to be, that the protocol for speaking with the server is not isolated good enough in a
 *       separate class. This can be seen  for the 'communication_request' message. There are two functions that
 *       format it right: EncryptedConnection_Client and CommunicationServerConnection_Server have a
 *       sendCommunicationRequestMessage, but they don't really fit for this task, so you have to do it manually
 *       bypassing the type checks for this command.
 *       This should be cleaned up so that it is easier to understand the code of the low level tests!
 */
describe('communication server tests', () => {
    let commServer: CommunicationServer | null = null;

    before('Start comm server', async () => {
        commServer = new CommunicationServer();
        await commServer.start('localhost', 8080);
    });

    // todo needs fixing why isn't it closing
    after(async () => {
        if (commServer) {
            await commServer.stop();
        }
    });

    it('Register client open connection to commserver and exchange messages', async function () {
        // Setup the listening connection - it mirrors the messages back
        let listenerFailure: any | null = null;
        const listenerKeyPair = tweetnacl.box.keyPair();
        let commServerListener = new CommunicationServerListener(1, 1000);
        commServerListener.onChallenge(
            (challenge: Uint8Array, publicKey: Uint8Array): Uint8Array => {
                const decryptedChallenge = decryptWithPublicKey(
                    publicKey,
                    challenge,
                    listenerKeyPair.secretKey
                );
                for (let i = 0; i < decryptedChallenge.length; ++i) {
                    decryptedChallenge[i] = ~decryptedChallenge[i];
                }
                return encryptWithPublicKey(
                    publicKey,
                    decryptedChallenge,
                    listenerKeyPair.secretKey
                );
            }
        );
        commServerListener.onConnection(async (ws: WebSocketPromiseBased) => {
            if (ws.webSocket === null) {
                throw new Error('ws.webSocket is null');
            }
            try {
                while (ws.webSocket.readyState === WebSocketWS.OPEN) {
                    await ws.send(await ws.waitForMessage(1000));
                }
            } catch (e) {
                // This will also fail on a closing connection, but this is okay, because the listenerFailure
                // will only be evaluated before the closing of connections happens.
                listenerFailure = e;
            }
        });
        commServerListener.start('ws://localhost:8080', listenerKeyPair.publicKey);

        try {
            // Wait until the state changes to listening.
            let retryCount = 0;
            while (commServerListener.state != CommunicationServerListenerState.Listening) {
                await wait(500);
                ++retryCount;
                if (++retryCount >= 5) {
                    throw new Error('Registering at comm server timed out.');
                }
            }

            // Setup outgoing connection and send something
            const clientKeyPair = tweetnacl.box.keyPair();
            let clientConn = new WebSocketPromiseBased(createWebSocket('ws://localhost:8080'));

            try {
                await clientConn.waitForOpen(1000);

                // MESSAGE1 SEND: Send the communication request message that will tell the comm server where to forward the connection to
                await clientConn.send(
                    JSON.stringify({
                        command: 'communication_request',
                        sourcePublicKey: uint8arrayToHexString(clientKeyPair.publicKey),
                        targetPublicKey: uint8arrayToHexString(listenerKeyPair.publicKey)
                    })
                );

                // MESSAGE1 RECEIVE: Wait for the mirrored communication request message
                const msg1 = await clientConn.waitForJSONMessage(1000);
                expect(msg1.command).to.be.equal('communication_request');
                expect(msg1.sourcePublicKey).to.be.equal(
                    uint8arrayToHexString(clientKeyPair.publicKey)
                );
                expect(msg1.targetPublicKey).to.be.equal(
                    uint8arrayToHexString(listenerKeyPair.publicKey)
                );

                // MESSAGE2 SEND:
                await clientConn.send('Hello Friend!');

                // MESSAGE2 RECEIVE:
                const msg2 = await clientConn.waitForMessage();
                expect(msg2).to.be.equal('Hello Friend!');

                // Check if the listener had any errors
                expect(listenerFailure).to.be.null;
            } finally {
                // Cleanup of everything
                clientConn.close();
            }
        } finally {
            await commServerListener.stop();
        }
    }).timeout(10000);
});
