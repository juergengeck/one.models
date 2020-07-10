/*
import CommunicationServerListener from './CommunicationServerListener';
import WebSocketListener from './WebSocketListener';
import WebSocket from 'ws';
import {wslogId} from './LogUtils';
import {createMessageBus} from 'one.core/lib/message-bus';
import I2IConnection_Server from "./EncryptedConnection_Server";

const MessageBus = createMessageBus('IncomingConnectionManager');

class IncomingConnectionManager {
    commServerListener: Map<string, CommunicationServerListener>;
    webSocketListener: Map<string, WebSocketListener>;

    constructor() {
        this.commServerListener = new Map<string, CommunicationServerListener>();
        this.webSocketListener = new Map<string, WebSocketListener>();
    }

    public async listenForCommunicationServerConnections(
        server: string,
        publicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        const strPublicKey = Buffer.from(publicKey).toString('hex');

        const listener = new CommunicationServerListener(2, 10000);
        listener.onChallenge = (challenge: Uint8Array, publicKey: Uint8Array): Uint8Array => {
            const decryptedChallenge = decrypt(publicKey, challenge);
            return encrypt(publicKey, decryptedChallenge);
        };
        listener.onConnection = (ws: WebSocket) => {
            this.acceptConnection(ws, server, publicKey, encrypt, decrypt);
        };
        await listener.start(server, publicKey);
        this.commServerListener.set(strPublicKey, listener);
    }

    public async listenForDirectConnections(
        host: string,
        port: number,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        return;
    }

    private async acceptConnection(
        ws: WebSocket,
        server: string,
        publicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(ws)}: Accepted WebSocket`);
        try {
            const conn = new I2IConnection_Server(ws);
            conn.waitForMessage()










            if (this.onConnection) {
                this.onConnection(ws);
            }
        } catch (e) {
            MessageBus.send('log', `${wslogId(ws)}: ${e}`);
            ws.close();
        }
    }
}*/

export default IncomingConnectionManager;
/*
enum connectionState {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting
};

class InstanceCommunicationManager {
    // Verbinden mit Instanz
    // Wege wie das funktioniert ist im ContactManagement hinterlegt.
    // Irgendwo sollte es aber auch ein Interface geben, welches diese Wege als Parameter überreicht bekommt
    //
    // Wege Optionen:
    // * active connect (url, target public key, source public key, instance id??)
    // * passive comm server (url commserver, source public key, )
    // * passive direct connection (port)
    connectToInstance(instance);

    disconnectFromInstance(instance);

    connectionState state(Instance);

    onConnectionStateChanged(Instance, oldState, newState);
}

type InstanceInfo {
    instance: Instance,
    endpoint: Endpoint
};

class InstanceManager {
    constructor(Contactmanagement);

    getInstancesForPerson(personid, includealiases): InstanceInfo[]
        // Inspect Contact obejcts

    getMyInstances(includealiases): InstanceInfo[]
        // Worwards to getInstancesForPerson

    connect(MyInstance, TheirInstace or MyInstance)

    disconnect(MyInstance, TheirInstance)
}*/
