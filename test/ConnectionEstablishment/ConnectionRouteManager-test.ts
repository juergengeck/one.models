import tweetnacl from 'tweetnacl';
import {wait} from '@refinio/one.core/lib/util/promise';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import ConnectionRouteManager from '../../lib/misc/ConnectionEstablishment/ConnectionRouteManager';
import type Connection from '../../src/misc/Connection/Connection';

//import {start} from '@refinio/one.core/lib/logger';
//start({includeTimestamp: true, types: ['log', 'debug', 'alert', 'error']});

describe('CommunicationModule test', () => {
    beforeEach('Setup connections', async function () {});

    afterEach('Shutdown Connections', async function () {});

    it('simple connection', async function () {
        const client = new ConnectionRouteManager(1000);
        const server = new ConnectionRouteManager(1000);

        client.onConnection(
            (
                conn: Connection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array,
                connectionGroupName: string,
                routeId: string,
                initiatedLocally: boolean
            ) => {
                console.log(
                    `Established client connection from ${uint8arrayToHexString(
                        localPublicKey
                    )} to ${uint8arrayToHexString(
                        remotePublicKey
                    )} wit connection group ${connectionGroupName} over route ${routeId}. Connection was initiated ${
                        initiatedLocally ? 'locally' : 'remotely'
                    }.`
                );
            }
        );

        client.onConnectionViaCatchAll(
            (
                conn: Connection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array,
                connectionGroupName: string,
                routeId: string,
                initiatedLocally: boolean
            ) => {
                console.log(
                    `Established client connection from ${uint8arrayToHexString(
                        localPublicKey
                    )} to ${uint8arrayToHexString(
                        remotePublicKey
                    )} wit connection group ${connectionGroupName} over catch-all route ${routeId}. Connection was initiated ${
                        initiatedLocally ? 'locally' : 'remotely'
                    }.`
                );
            }
        );

        server.onConnection(
            (
                conn: Connection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array,
                connectionGroupName: string,
                routeId: string,
                initiatedLocally: boolean
            ) => {
                console.log(
                    `Established server connection from ${uint8arrayToHexString(
                        localPublicKey
                    )} to ${uint8arrayToHexString(
                        remotePublicKey
                    )} wit connection group ${connectionGroupName} over route ${routeId}. Connection was initiated ${
                        initiatedLocally ? 'locally' : 'remotely'
                    }.`
                );
            }
        );

        server.onConnectionViaCatchAll(
            (
                conn: Connection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array,
                connectionGroupName: string,
                routeId: string,
                initiatedLocally: boolean
            ) => {
                console.log(
                    `Established server connection from ${uint8arrayToHexString(
                        localPublicKey
                    )} to ${uint8arrayToHexString(
                        remotePublicKey
                    )} wit connection group ${connectionGroupName} over catch-all route ${routeId}. Connection was initiated ${
                        initiatedLocally ? 'locally' : 'remotely'
                    }.`
                );
            }
        );

        const clientKeys = tweetnacl.box.keyPair();
        const clientKeys2 = tweetnacl.box.keyPair();
        const serverKeys = tweetnacl.box.keyPair();
        const serverKeys2 = tweetnacl.box.keyPair();

        console.log(`Key C1 ${uint8arrayToHexString(clientKeys.publicKey)}`);
        console.log(`Key C2 ${uint8arrayToHexString(clientKeys2.publicKey)}`);
        console.log(`Key S1 ${uint8arrayToHexString(serverKeys.publicKey)}`);
        console.log(`Key S2 ${uint8arrayToHexString(serverKeys2.publicKey)}`);

        client.addOutgoingWebsocketRoute(
            clientKeys.publicKey,
            serverKeys.publicKey,
            (otherKey, text) => {
                //console.log(`encryptC1 ${uint8arrayToHexString(otherKey)} ${text}`);
                const e = tweetnacl.box(
                    text,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    clientKeys.secretKey
                );
                //console.log(`encryptC2 ${uint8arrayToHexString(e)}`);
                return e;
            },
            (otherKey, cypher) => {
                const e = tweetnacl.box.open(
                    cypher,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    clientKeys.secretKey
                );
                if (e === null) {
                    throw new Error('Failed to decrypt C');
                }
                return e;
            },
            'ws://localhost:8500',
            'low_bandwidth',
            1000
        );

        /*client.addOutgoingWebsocketRoute(
            clientKeys.publicKey,
            serverKeys.publicKey,
            (otherKey, text) =>
                tweetnacl.box(
                    text,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    clientKeys.secretKey
                ),
            (otherKey, cypher) => {
                const e = tweetnacl.box.open(
                    cypher,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    clientKeys.secretKey
                );
                if (e === null) {
                    throw new Error('Failed to decrypt');
                }
                return e;
            },
            'ws://localhost:8500',
            'high_bandwidth',
            1000
        );*/

        server.addIncomingWebsocketRouteCatchAll_Direct(
            serverKeys.publicKey,
            (otherKey, text) => {
                return tweetnacl.box(
                    text,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    serverKeys.secretKey
                );
            },
            (otherKey, cypher) => {
                /*console.log(
                    `decryptSA1 ${uint8arrayToHexString(otherKey)} ${uint8arrayToHexString(cypher)}`
                );*/
                const e = tweetnacl.box.open(
                    cypher,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    serverKeys.secretKey
                );
                //console.log(`decryptSA2 ${e}`);
                if (e === null) {
                    throw new Error('Failed to decrypt SA');
                }
                return e;
            },
            'localhost',
            8500
        );

        server.addIncomingWebsocketRoute_Direct(
            serverKeys.publicKey,
            clientKeys.publicKey,
            (otherKey, text) => {
                return tweetnacl.box(
                    text,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    serverKeys.secretKey
                );
            },
            (otherKey, cypher) => {
                /*console.log(
                    `decryptS1 ${uint8arrayToHexString(otherKey)} ${uint8arrayToHexString(cypher)}`
                );*/
                const e = tweetnacl.box.open(
                    cypher,
                    new Uint8Array(tweetnacl.box.nonceLength),
                    otherKey,
                    serverKeys.secretKey
                );
                //console.log(`decryptS2 ${e}`);
                if (e === null) {
                    throw new Error('Failed to decrypt S');
                }
                return e;
            },
            'localhost',
            8500,
            'high_bandwidth'
        );

        //await client.enableRoutesForTargetAndSource(clientKeys.publicKey, serverKeys.publicKey);
        //await server.enableAllRoutesForTargetAndSource(serverKeys.publicKey,
        // clientKeys.publicKey);
        await client.enableRoutes();
        await server.enableRoutes();
        client.debugDump('client.');
        server.debugDump('server.');

        console.log('WAIT');
        await wait(5000);
        client.debugDump('client2.');
        server.debugDump('server2.');
        await server.disableRoutes();
        await client.disableRoutes();
        await wait(5000);
        client.debugDump('client3.');
        server.debugDump('server3.');
        /*console.log('Disable client routes');
        const p1 = client.disableRoutes();
        await wait(5000);
        console.log('Disable server routes');
        const p2 = server.disableRoutes();

        console.log('WAIT DONE2');
        //client.closeConnections();
        console.log('WAIT DONE3');
        //server.closeConnections();
        console.log('WAIT DONE4');
        await p1;
        await p2;*/
    }).timeout(20000);
});
