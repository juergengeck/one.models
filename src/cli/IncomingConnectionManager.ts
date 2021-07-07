import yargs from 'yargs';
import tweetnacl from 'tweetnacl';
import {decryptWithPublicKey, encryptWithPublicKey} from 'one.core/lib/instance-crypto';
import WebSocket from 'isomorphic-ws';
import * as Logger from 'one.core/lib/logger';
import fs from 'fs';
import readline from 'readline';
import {wslogId} from '../misc/LogUtils';
import type EncryptedConnection from '../misc/EncryptedConnection';
import IncomingConnectionManager from '../misc/IncomingConnectionManager';

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
                resolve(true);
            });
        });
    }

    // The websocket that is connected to the console
    let consoleWs: EncryptedConnection | null = null;

    // Create commserver listener and register callbacks
    const connManager = new IncomingConnectionManager();
    connManager.listenForCommunicationServerConnections(
        argv.u,
        keyPair.publicKey,
        (pubkey: Uint8Array, text: Uint8Array): Uint8Array => {
            return encryptWithPublicKey(pubkey, text, keyPair.secretKey);
        },
        (pubkey: Uint8Array, cypherText: Uint8Array): Uint8Array => {
            return decryptWithPublicKey(pubkey, cypherText, keyPair.secretKey);
        }
    );
    connManager.listenForDirectConnections(
        'localhost',
        8001,
        keyPair.publicKey,
        (pubkey: Uint8Array, text: Uint8Array): Uint8Array => {
            return encryptWithPublicKey(pubkey, text, keyPair.secretKey);
        },
        (pubkey: Uint8Array, cypherText: Uint8Array): Uint8Array => {
            return decryptWithPublicKey(pubkey, cypherText, keyPair.secretKey);
        }
    );

    connManager.onConnection(
        async (
            conn: EncryptedConnection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array
        ): Promise<void> => {
            try {
                console.log(`${wslogId(conn.webSocket)}: Accepted connection.`);

                // Release old connection
                if (consoleWs) {
                    consoleWs.webSocket.close(1000, 'New client connected');
                }

                // Connect the websocket to the console
                console.log(
                    `${wslogId(
                        conn.webSocket
                    )}: Connect websocket to console. You can now type stuff.`
                );
                consoleWs = conn;
                consoleWs.webSocket.addEventListener('error', e => {
                    console.log(e.message);
                });
                consoleWs.webSocket.addEventListener('close', e => {
                    if (e.reason !== 'New client connected') {
                        consoleWs = null;
                    }
                    console.log(`${wslogId(conn.webSocket)}: Connection closed: ${e.reason}`);
                });

                // Wait for messages
                while (conn.webSocket.readyState === WebSocket.OPEN) {
                    console.log(await conn.waitForMessage());
                }
            } catch (e) {
                console.log(`${wslogId(conn.webSocket)}: ${e}`);
            }
        }
    );

    // ######## CONSOLE I/O ########

    // Setup console for communication with the other side
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Stop everything at sigint
    function sigintHandler() {
        connManager.shutdown();
        if (consoleWs) {
            if (consoleWs.webSocket.readyState === WebSocket.OPEN) {
                consoleWs.close();
            }
        }
        rl.close();
    }
    rl.on('SIGINT', sigintHandler);
    process.on('SIGINT', sigintHandler);

    // Read from stdin
    for await (const line of rl) {
        if (!consoleWs) {
            console.log('Error: Not connected to any client.');
        } else {
            // TODO: check this never error
            // @ts-ignore
            await consoleWs.sendMessage(line);
        }
    }
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString());
});
