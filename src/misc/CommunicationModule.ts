/*
import CommunicationServerConnector from './CommunicationServerConnector';
import {default as WebSocket} from 'ws';
import {Instance, SHA256IdHash} from '@OneCoreTypes';

type InstanceEndpoint = {
    connection: string;
    pubKey: string;
};

export default class CommunicationModule {
    constructor() {
    }

    start() {
        // Iterate over the connections that shall be established (Just a list of instance id hashes)
        let instances = ['AF12351468', '789FDE11'] as SHA256IdHash<Instance>[];
        Promise.all(
            instances.map(async (instance) => {
                await this.connect(instance);
            })
        );
    }

    async connect(instance: SHA256IdHash<Instance>): Promise<void> {
        // Check that connection is not already established / listening

        // Lookup the endpoint in contact management for that instance
        const destEndpoint: InstanceEndpoint = {
            connection: 'ws://localhost:7999',
            pubKey: 'xyz'
        };

        // Start a connection
        const webSocket = new WebSocket(destEndpoint.connection);
        //await ...
        this.openedConnections.set(instance, [webSocket]);

        // When the establishment failed then register on the comm server

        // Where do we get this from???
        // We have to iterate over the ContactObjects (or use the main contact object?) and
        // Look at the endpoint for the current instance. It has the URL of the comm server.
        // A different way might be to store this information per instance in an extra object.
        const myInstanceEndpoint: InstanceEndpoint = {
            connection: 'ws://localhost:7999',
            pubKey: 'abcdefg'
        };

        // Register me at the comm server
        await this.communicationServerConnector.register(
            myInstanceEndpoint.connection,
            myInstanceEndpoint.pubKey
        );
    }

    async disconnect(instance: SHA256IdHash<Instance>): Promise<void> {
        const availableWebSockets = this.openedConnections.get(instance);
        if (!availableWebSockets) {
            return;
        }

        for (let ws of availableWebSockets) {
            ws.close();
        }
    }

    stop() {
        this.communicationServerConnector.shutDown();
    }

    private communicationServerConnector: CommunicationServerConnector;
    private onConnection: ((webSocket: WebSocket) => void) | null;
    private onChallenge: ((challenge: string, pubKey: string) => string) | null;
    private openedConnections: Map<SHA256IdHash<Instance>, WebSocket[]>;
}
*/