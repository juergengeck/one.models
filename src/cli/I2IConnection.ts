import yargs from 'yargs';
import tweetnacl from 'tweetnacl';
import * as Logger from "one.core/lib/logger";
import I2IConnection_Client from "../misc/I2IConnection_Client";
import fs from 'fs';
import * as readline from "readline";
import WebSocket from "ws";

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    const argv = yargs

        // Url of communication server
        .alias('u', 'url')
        .describe('u', 'Url of other instance.')
        .default('u', 'ws://localhost:8000')

        // Logger
        .describe('l', 'Enable logger')
        .boolean('l')

        // Evaluate
        .argv;

    if(argv.l) {
        Logger.start({ types: ['log'] });
    }

    // Generate public / private keypair
    const keyPair = tweetnacl.box.keyPair();

    // Load public key from listener
    let otherPublicKey: Uint8Array = await new Promise((resolve, reject) => {
        fs.readFile('public.key', (err: Error | null, data: Buffer) => {
            if(err) {
                reject(err);
            }
            else {
                var res = new Uint8Array(data.byteLength);
                for (var i = 0; i < data.byteLength; ++i) {
                    res[i] = data.readInt8(i);
                }
                resolve(res);
            }
        });
    });

    // Create commserver listener and register callbacks
    console.log(`Connection to : ${argv.u}`)
    const conn = new I2IConnection_Client(argv.u);
    await conn.webSocketPB.waitForOpen();
    console.log(`Successfully connected to : ${argv.u}`)

    // Request communication
    console.log(`Send communication_request`);
    await conn.sendCommunicationRequestMessage(keyPair.publicKey, otherPublicKey);

    // Wait for accept message
    console.log('Wait for communication_accept');
    await conn.waitForMessage('communication_accept');
    console.log('Communication request accepted. Connect websocket to console. Yo can now type stuff');

    // ######## CONSOLE I/O ########

    // Setup console for communication with the other side
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // From here on - raw websocket communication
    const consoleWs = conn.releaseWebSocket();
    consoleWs.addEventListener('message', (e) => {
       console.log(e.data);
    });
    consoleWs.addEventListener('error', (e) => {
        console.log(e.message);
    });
    consoleWs.addEventListener('close', (e) => {
        console.log('Connection closed: ' + e.reason);
        rl.close();
    });

    // Stop everything at sigint
    function sigintHandler() {
        if(consoleWs) {
            if(consoleWs.readyState === WebSocket.OPEN) {
                consoleWs.close();
            }
        }
        rl.close();
    };
    rl.on('SIGINT', sigintHandler);
    process.on('SIGINT', sigintHandler);

    // Read from stdin
    for await (const line of rl) {
        await new Promise((resolve, reject) => {
            consoleWs.send(line, (err?: Error) => {
                if(err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }

}

// Execute main function
main()
    .catch(e => {
        console.log('Error happened: ' + e.toString());
    });




