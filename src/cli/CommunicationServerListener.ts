import yargs from 'yargs';
import tweetnacl from 'tweetnacl';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';
import WebSocket from 'ws';
import CommunicationServerListener, {
    CommunicationServerListenerState
} from '../misc/CommunicationServerListener';
import * as Logger from 'one.core/lib/logger';
import fs from 'fs';
import readline from 'readline';
import EncryptedConnetion_Server from '../misc/EncryptedConnection_Server';
import {wslogId} from '../misc/LogUtils';

/**
 * Tests whether the two passed Uint8Arrays are equal.
 *
 * @param {Uint8Array} a1 - Array 1 to compare
 * @param {Uint8Array} a2 - Array 2 to compare
 * @returns {boolean} true if equal, false if not.
 */
function testEqualityUint8Array(a1: Uint8Array, a2: Uint8Array): boolean {
    if (a1.length != a2.length) {
        return false;
    }

    for (let i = 0; i < a1.length; ++i) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    const argv =
        // Evaluate
        yargs

            // Url of communication server
            .alias('u', 'url')
            .describe('u', 'Url of communication server.')
            .default('u', 'ws://localhost:8000')

            // Spare connections
            .alias('s', 'sparecount')
            .describe('s', 'Number of spare connections to use.')
            .default('s', 1)

            // Reconnect timeout
            .describe('t', 'Reconnect timeout')
            .default('t', 5000)

            // Write public key
            .describe('p', 'Write public key to public.key file')
            .boolean('p')

            // Logger
            .describe('l', 'Enable logger')
            .boolean('l').argv;

    if (argv.l) {
        Logger.start({types: ['log']});
    }

    // Generate public / private keypair and write it to file if requested
    const keyPair = tweetnacl.box.keyPair();
    if (argv.p) {
        await new Promise(resolve => {
            fs.writeFile('public.key', keyPair.publicKey, () => {
                resolve();
            });
        });
    }

    // The websocket that is connected to the console
    let consoleWs: WebSocket | null = null;

    // Create commserver listener and register callbacks
    const listener = new CommunicationServerListener(argv.s, argv.t);
    listener.onChallenge = (challenge: Uint8Array, pubkey: Uint8Array): Uint8Array => {
        const decryptedChallenge = decryptWithPublicKey(pubkey, challenge, keyPair.secretKey);
        return encryptWithPublicKey(pubkey, decryptedChallenge, keyPair.secretKey);
    };
    listener.onConnection = async (ws: WebSocket): Promise<void> => {
        try {
            console.log(`${wslogId(ws)}: Accepted connection.`);
            const conn = new EncryptedConnetion_Server(ws);
            const request = await conn.waitForUnencryptedMessage('communication_request');
            if (testEqualityUint8Array(request.targetPublicKey, keyPair.publicKey)) {
                // Sending to the client that we accept his connection
                console.log(`${wslogId(ws)}: Send communication_accept message.`);
                await conn.sendCommunicationReadyMessage();

                // Release old connection
                if (consoleWs) {
                    consoleWs.close(1000, 'New client connected');
                }

                // Connect the websocket to the console
                console.log(
                    `${wslogId(ws)}: Connect websocket to console. You can now type stuff.`
                );
                consoleWs = conn.releaseWebSocket();
                consoleWs.addEventListener('message', e => {
                    console.log(e.data);
                });
                consoleWs.addEventListener('error', e => {
                    console.log(e.message);
                });
                consoleWs.addEventListener('close', e => {
                    if (e.reason !== 'New client connected') {
                        consoleWs = null;
                    }
                    console.log(`${wslogId(ws)}: Connection closed: ${e.reason}`);
                });
            } else {
                conn.close('Request public key does not match this public key.');
                throw new Error('Request public key does not match this public key.');
            }
        } catch (e) {
            console.log(`${wslogId(ws)}: ${e}`);
        }
    };
    listener.onStateChange = (
        newState: CommunicationServerListenerState,
        oldState: CommunicationServerListenerState
    ) => {
        console.log(`State change from '${oldState}' to '${newState}'`);
    };

    // Start comm server
    listener.start(argv.u, keyPair.publicKey);

    // ######## CONSOLE I/O ########

    // Setup console for communication with the other side
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Stop everything at sigint
    function sigintHandler() {
        listener.stop();
        if (consoleWs) {
            if (consoleWs.readyState === WebSocket.OPEN) {
                consoleWs.close();
            }
        }
        rl.close();
    }
    rl.on('SIGINT', sigintHandler);
    process.on('SIGINT', sigintHandler);

    // Read from stdin
    for await (const line of rl) {
        await new Promise((resolve, reject) => {
            if (!consoleWs) {
                console.log('Error: Not connected to any client.');
                resolve();
                return;
            }
            consoleWs.send(line, (err?: Error) => {
                if (err) {
                    console.log(err);
                }

                resolve();
            });
        });
    }
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString());
});
