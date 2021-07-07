import CommunicationServerListener, {
    CommunicationServerListenerState
} from './CommunicationServerListener';
import WebSocketListener from './WebSocketListener';
import tweetnacl from 'tweetnacl';
import {wslogId} from './LogUtils';
import {createMessageBus} from 'one.core/lib/message-bus';
import EncryptedConnection_Server from './EncryptedConnection_Server';
import type EncryptedConnection from './EncryptedConnection';
import type WebSocketPromiseBased from './WebSocketPromiseBased';
import {OEvent} from './OEvent';

const MessageBus = createMessageBus('IncomingConnectionManager');

/**
 * This class manages and authenticates incoming connections.
 */
class IncomingConnectionManager {
    /**
     * Event is emitted when E2E connection is setup correctly. The event will pass the connection to the listener.
     */
    public onConnection = new OEvent<
        (conn: EncryptedConnection, localPublicKey: Uint8Array, remotePublicKey: Uint8Array) => void
    >();

    /**
     * Event is emitted when the state of the connector changes. The listener callback will be called
     * in order to have access from outside to the errors that occur on the web socket level.
     */
    public onOnlineStateChange = new OEvent<(online: boolean) => void>();

    commServerListener: Map<string, CommunicationServerListener[]>;
    webSocketListener: Map<
        string,
        {
            listener: WebSocketListener;
            registeredPublicKeys: Uint8Array[];
        }
    >;

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns {boolean}
     */
    get onlineState(): boolean {
        for (const listeners of this.commServerListener.values()) {
            for (const listener of listeners) {
                if (listener.state !== CommunicationServerListenerState.Listening) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Construct a new IncomingConnectionManager
     */
    constructor() {
        this.commServerListener = new Map<string, CommunicationServerListener[]>();
        this.webSocketListener = new Map<
            string,
            {
                listener: WebSocketListener;
                registeredPublicKeys: Uint8Array[];
            }
        >();
    }

    /**
     * Listen for connections using a communication server.
     *
     * @param {string} server - The communication server to use. (URL is passed to WebSocket)
     * @param {Uint8Array} publicKey - The public key to use for registration
     * @param {(pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array} encrypt - Function to encrypt stuff. This function is used for
     *      1) Setting up an encrypted connection to the peer (
     *      2) and authentication against the comm server. For later communication it is not used.
     * @param {(pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array} decrypt
     * @returns {Promise<void>}
     */
    public async listenForCommunicationServerConnections(
        server: string,
        publicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array, // Where do we decide wether to accept a connection???
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        // String representation of public string
        const strPublicKey = Buffer.from(publicKey).toString('hex');

        // Create listener for this key
        const listener = new CommunicationServerListener(2, 10000);
        listener.onChallenge((challenge: Uint8Array, publicKey: Uint8Array): Uint8Array => {
            const decryptedChallenge = decrypt(publicKey, challenge);
            for (let i = 0; i < decryptedChallenge.length; ++i) {
                decryptedChallenge[i] = ~decryptedChallenge[i];
            }
            return encrypt(publicKey, decryptedChallenge);
        });
        listener.onConnection((ws: WebSocketPromiseBased) => {
            this.acceptConnection(ws, [publicKey], encrypt, decrypt);
        });

        // Connect the stateChanged event to the onelineStateChanged event
        listener.onStateChange(() => {
            // Delay the notification to remove short offline states
            // TODO: this emits the event multiple times ... fix this later
            setTimeout(() => {
                this.onOnlineStateChange.emit(this.onlineState);
            }, 1000);
        });

        // Start listener
        await listener.start(server, publicKey);

        // Append to list
        const listenerList = this.commServerListener.get(strPublicKey);
        if (listenerList) {
            listenerList.push(listener);
        } else {
            this.commServerListener.set(strPublicKey, [listener]);
        }
    }

    /**
     * Listen for direct connections.
     *
     * @param {string} host
     * @param {number} port
     * @param {Uint8Array} publicKey
     * @param {(pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array} encrypt
     * @param {(pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array} decrypt
     * @returns {Promise<void>}
     */
    public async listenForDirectConnections(
        host: string,
        port: number,
        publicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        const strHostPort = host + ':' + port.toString(); // key for map

        let listenerInfo = this.webSocketListener.get(strHostPort);

        // If no listener exists create and start the web socket listener
        if (!listenerInfo) {
            // Create the array of registerd public keys
            const registeredPublicKeys: Uint8Array[] = [publicKey];

            // Create web socket listener & connect signals
            const listener = new WebSocketListener();
            listener.onConnection((ws: WebSocketPromiseBased) => {
                this.acceptConnection(ws, registeredPublicKeys, encrypt, decrypt);
            });

            // Start the listener
            await listener.start(host, port);

            // Add listener to array
            this.webSocketListener.set(strHostPort, {
                listener,
                registeredPublicKeys
            });
        }

        // If it already exists, just add the current publicKey to registered keys list.
        else {
            listenerInfo.registeredPublicKeys.push(publicKey);
        }
    }

    /**
     * Shutdown the listeners.
     *
     * This does not shutdown the already established encrypted connections, it just shuts doen the listeners.
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        MessageBus.send('log', `shutdown()`);
        for (const [k, v] of this.commServerListener.entries()) {
            MessageBus.send('log', `Shutdown comm server listener: ${k}`);
            for (const listener of v) {
                await listener.stop();
            }
        }
        for (const [k, v] of this.webSocketListener.entries()) {
            MessageBus.send('log', `Shutdown web socket listener: ${k}`);
            await v.listener.stop();
        }
    }

    // ######## Private API ########

    // What do we actually need here?
    // A list of acceptable public keys for this connection.
    private async acceptConnection(
        ws: WebSocketPromiseBased,
        allowedPublicKeys: Uint8Array[],
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(ws.webSocket)}: Accepted WebSocket`);
        try {
            const conn = new EncryptedConnection_Server(ws);

            // Step 1: Wait for the communication request
            const request = await conn.waitForUnencryptedMessage('communication_request');

            // Step 2: Send communication ready message
            await conn.sendCommunicationReadyMessage();

            // Step 3: Check whether the request has come through the right endpoint
            //           (someone might probe an anonymous endpoint for the real id)
            let rejectConnection = true;
            for (let i = 0; i < allowedPublicKeys.length; ++i) {
                if (tweetnacl.verify(request.targetPublicKey, allowedPublicKeys[i])) {
                    rejectConnection = false;
                    // No break here, so that the loop execution time stays constant
                    // compared between success and failure.
                    // It is not constant when the
                    // number of allowed public keys changes, but for now it is not so bad, because
                    // anonymous endpoints should only have one element.
                }
            }

            // Step 4: Check whether our id wants to communicate with the other side
            // This step should also run in constant time ... but we can't decide it here. We would have to
            // 1) call a callback or
            // 2) we also get an array of allowed peers for a given public key
            // ... but let's do this later.
            // TODO: implement this step (select communication partners)

            // Step 5: Initiate key exchange
            // Note that termination of a connection should always be done after the peer proved, that it has the
            // public key, but after we proved, that we have our public key. This means that we don't expose any
            // information about what identities we have, because the following scenarios terminate at the same
            // point in protocol and also if possible at the exact same time time (side channel timing attacks!)
            // If the third parameter is false the connection is closed at exactly the right
            await conn.exchangeKeys(
                text => encrypt(request.sourcePublicKey, text),
                cypherText => decrypt(request.sourcePublicKey, cypherText),
                rejectConnection
            );

            // Step 6: E2E encryption is setup correctly. Pass the connection to a listener.
            this.onConnection.emit(conn, request.targetPublicKey, request.sourcePublicKey);
        } catch (e) {
            MessageBus.send('log', `${wslogId(ws.webSocket)}: ${e}`);
            ws.close();
            throw e;
        }
    }
}

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
