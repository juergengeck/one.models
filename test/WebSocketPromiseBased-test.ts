import {expect} from 'chai';
import WebSocketWS from 'isomorphic-ws';
import WebSocketPromiseBased from '../lib/misc/WebSocketPromiseBased';
import WebSocketServerPromiseBased from '../lib/misc/WebSocketServerPromiseBased';
import {createWebSocket} from 'one.core/lib/system/websocket';
import {wait} from 'one.core/lib/util/promise';
import {start} from 'one.core/lib/logger';
start({includeTimestamp: true});
describe('websocket wait tests', () => {
    let webSocketServer: WebSocketServerPromiseBased;
    let connClient: WebSocketPromiseBased;
    let connServer: WebSocketPromiseBased;

    beforeEach('Setup connections', async function () {
        // Create the server
        webSocketServer = new WebSocketServerPromiseBased(new WebSocketWS.Server({port: 8080}));

        // Setup connections
        connClient = new WebSocketPromiseBased(createWebSocket('ws://localhost:8080'));
        await connClient.waitForOpen();
        connServer = new WebSocketPromiseBased(await webSocketServer.waitForConnection());
        await connServer.waitForOpen();
    });

    it('tests waitForMessage: no failures in 4 messages', async function () {
        await connClient.send('DATA1');
        expect(await connServer.waitForMessage()).to.be.equal('DATA1');
        await connClient.send('DATA2');
        expect(await connServer.waitForMessage()).to.be.equal('DATA2');

        await connServer.send('DATA3');
        expect(await connClient.waitForMessage()).to.be.equal('DATA3');
        await connServer.send('DATA4');
        expect(await connClient.waitForMessage()).to.be.equal('DATA4');
    });

    //@todo FIX
    /* it('tests waitForMessage: wait for message timeout', async function () {
        try {
            await connServer.waitForMessage();
            expect.fail('Should not succeed');
        } catch (e) {
            expect(e.toString()).to.not.be.equal(undefined);
        }
    }).timeout(6000);*/

    it('tests waitForMessageWitType: no failures in two messages', async function () {
        const message1 = {
            type: 'mytype1',
            message: 'XYZ'
        };
        await connClient.send(JSON.stringify(message1));
        expect(await connServer.waitForJSONMessageWithType('mytype1')).to.be.eql(message1);

        const message2 = {
            type: 'mytype2',
            message: 'ABC'
        };
        await connClient.send(JSON.stringify(message2));
        expect(await connServer.waitForJSONMessageWithType('mytype2')).to.be.eql(message2);
    });

    it('tests waitForMessageWitType: wrong type', async function () {
        const message1 = {
            type: 'mytype1',
            message: 'XYZ'
        };
        await connClient.send(JSON.stringify(message1));

        try {
            await connServer.waitForJSONMessageWithType('mytype2');
            expect.fail('Should not succeed');
        } catch (e) {
            expect(e.toString()).to.be.match(/Received unexpected type/);
        }
    });

    it('should close with reason "Pong Timeout"', async function () {
        if (connClient.webSocket) {
            connClient.webSocket.close();
        }
        if (connServer.webSocket) {
            connServer.webSocket.close();
        }
        connClient = new WebSocketPromiseBased(
            createWebSocket('ws://localhost:8080'),
            undefined,
            3000,
            1000
        );
        await connClient.waitForOpen();

        await wait(5000);

        expect(connClient['closeReason'] === 'Pong Timeout');
        if (connClient.webSocket) {
            // 3 means closed
            expect(connClient.webSocket.readyState === 3);
        }
    }).timeout(6000);

    afterEach('Shutdown Connections', async function () {
        if (connClient.webSocket) {
            connClient.webSocket.close();
        }
        if (connServer.webSocket) {
            connServer.webSocket.close();
        }
        await new Promise<void>((resolve, reject) => {
            if (webSocketServer.webSocketServer) {
                webSocketServer.webSocketServer.close((err?: Error) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
});
