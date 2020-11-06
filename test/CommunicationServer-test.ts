import {expect} from 'chai';
import {ChildProcess, fork} from 'child_process';
import {join} from 'path';

let clients: ChildProcess;
let server: ChildProcess;

function processPromise(process: ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
        process.on('message', (msg: string) => {
            if (msg !== 'received the MatchResponse') {
                reject(new Error('wrong msg'));
            }
            resolve(msg);
        });
    });
}

function startClients(): Promise<string> {
    return new Promise((resolve, reject) => {
        server.on('message', (msg: string) => {
            if (msg === 'server started') {
                clients = fork(
                    join(__dirname, '../lib/misc/usage/CommunicationServerClientsStarter.js')
                );
                resolve(msg);
            } else {
                reject(new Error('wrong msg'));
            }
        });
    });
}

function startConnectorClients(): Promise<string> {
    return new Promise((resolve, reject) => {
        server.on('message', (msg: string) => {
            if (msg === 'server started') {
                clients = fork(
                    join(
                        __dirname,
                        '../lib/misc/usage/CommunicationServerConnectorClientsStarter.js'
                    )
                );
                resolve(msg);
            } else {
                reject(new Error('wrong msg'));
            }
        });
    });
}

describe('communication server tests', () => {
    let clientsResult: string;

    before('initialise processes', () => {
        server = fork(join(__dirname, '../lib/misc/usage/CommunicationServerStarter.js'));
    });

    it('should establish a connection directly to communication server', function (done) {
        startClients().then(async () => {
            // these results can not be computed in the it part, because
            // they are asynchronous calculated and the it function does
            // not behave correctly when maid asynchronous
            clientsResult = await processPromise(clients);
        });

        done();

        expect(clientsResult).to.be.equal('message received');
    });

    it('should establish a connection to communication server using connector', function (done) {
        if (clients) {
            clients.kill('SIGTERM');
        }

        startConnectorClients().then(async () => {
            // these results can not be computed in the it part, because
            // they are asynchronous calculated and the it function does
            // not behave correctly when maid asynchronous
            clientsResult = await processPromise(clients);
        });

        done();

        expect(clientsResult).to.be.equal('message received');
    });

    after(async () => {
        if (clients) {
            clients.kill('SIGTERM');
        }

        if (server) {
            server.kill('SIGTERM');
        }
    });
});
