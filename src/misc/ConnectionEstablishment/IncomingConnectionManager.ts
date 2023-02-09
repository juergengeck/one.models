import {ensurePublicKey} from '../../../../one.core/lib/crypto/encryption';
import type {PublicKey} from '../../../../one.core/lib/crypto/encryption';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import CommunicationServerListener, {
    CommunicationServerListenerState
} from './communicationServer/CommunicationServerListener';
import type Connection from '../Connection/Connection';
import {acceptWithEncryption} from './protocols/ConnectionSetup';
import {OEvent} from '../OEvent';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {getOrCreate} from '../../utils/MapUtils';
import WebSocketListener from './webSockets/WebSocketListener';

const MessageBus = createMessageBus('IncomingConnectionManager');

declare type CommServerUrl = string & {
    _1: 'CommServerUrl';
};

declare type LocalPublicKey = HexString & {
    _1: 'LocalPublicKey';
};

declare type HostPort = string & {
    _: 'HostPort';
};

function castToCommServerUrl(commServerUrl: string): CommServerUrl {
    return commServerUrl as CommServerUrl;
}

function castToLocalPublicKey(localPublicKey: Uint8Array): LocalPublicKey {
    return uint8arrayToHexString(localPublicKey) as LocalPublicKey;
}

function castToHostPort(host: string, port: number): HostPort {
    return `${host}:${port}` as HostPort;
}

type CommServerListenerInfo = {
    listener: CommunicationServerListener;
    referenceCount: number;
};

type WebSocketListenerInfo = {
    listener: WebSocketListener;
    registeredPublicKeys: Map<
        LocalPublicKey,
        {
            referenceCount: number;
        }
    >;
};

/**
 * This class manages and authenticates incoming connections.
 *
 * This class also ensures, that there aren't multiple listeners listening on the same socket,
 * which would lead to errors.
 */
export default class IncomingConnectionManager {
    /**
     * Event is emitted when E2E connection is setup correctly. The event will pass the connection to the listener.
     */
    public onConnection = new OEvent<
        (
            conn: Connection,
            localPublicKey: PublicKey,
            remotePublicKey: PublicKey,
            listenerId: string // Id to be able to identify listeners
        ) => void
    >();

    /**
     * Event is emitted when the state of the connector changes. The listener callback will be called
     * in order to have access from outside to the errors that occur on the web socket level.
     */
    public onOnlineStateChange = new OEvent<(online: boolean) => void>();

    private commServerListener = new Map<
        CommServerUrl,
        Map<LocalPublicKey, CommServerListenerInfo>
    >();
    private webSocketListener = new Map<HostPort, WebSocketListenerInfo>();

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns
     */
    get onlineState(): boolean {
        for (const keyListenerMap of this.commServerListener.values()) {
            for (const listenerInfo of keyListenerMap.values()) {
                if (listenerInfo.listener.state !== CommunicationServerListenerState.Listening) {
                    return false;
                }
            }
        }
        return true;
    }

    public static communicationServerListenerId(
        commServerUrl: string,
        localPublicKey: Uint8Array,
        listenerIdPrefix?: string
    ) {
        return `${
            listenerIdPrefix !== undefined ? listenerIdPrefix + ':' : ''
        }${commServerUrl}:${castToLocalPublicKey(localPublicKey)}`;
    }

    public static directConnectionListenerId(
        host: string,
        port: number,
        listenerIdPrefix?: string
    ) {
        return `${listenerIdPrefix !== undefined ? listenerIdPrefix + ':' : ''}${host}:${port}`;
    }

    /**
     * Listen for connections using a communication server.
     *
     * @param commServerUrl - The communication server to use. (URL is passed to WebSocket)
     * @param localPublicKey - The public key to use for registration
     * @param encrypt - Function to encrypt stuff. This function is used for
     *      1) Setting up an encrypted connection to the peer (
     *      2) and authentication against the comm server. For later communication it is not used.
     * @param decrypt
     * @param listenerIdPrefix - The prefix to add before the listener id
     */
    public async listenForCommunicationServerConnections(
        commServerUrl: string,
        localPublicKey: PublicKey,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array,
        listenerIdPrefix?: string
    ): Promise<() => Promise<void>> {
        MessageBus.send(
            'log',
            `listenForCommunicationServerConnections(${uint8arrayToHexString(
                localPublicKey
            )}, ${commServerUrl})`
        );

        const keyListenerMap = getOrCreate(
            this.commServerListener,
            castToCommServerUrl(commServerUrl),
            new Map<LocalPublicKey, CommServerListenerInfo>()
        );

        const keyEntry = keyListenerMap.get(castToLocalPublicKey(localPublicKey));
        if (keyEntry === undefined) {
            // start commserver
            keyListenerMap.set(
                castToLocalPublicKey(localPublicKey),
                await this.startNewCommunicationServerListener(
                    commServerUrl,
                    localPublicKey,
                    encrypt,
                    decrypt,
                    IncomingConnectionManager.communicationServerListenerId(
                        commServerUrl,
                        localPublicKey,
                        listenerIdPrefix
                    )
                )
            );
        } else {
            // increase refcount
            keyEntry.referenceCount++;
        }

        return async () => {
            await this.stopListeningForCommunicationServerConnections(
                commServerUrl,
                localPublicKey,
                encrypt,
                decrypt
            );
        };
    }

    public async stopListeningForCommunicationServerConnections(
        commServerUrl: string,
        localPublicKey: PublicKey,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        const keyListenerMap = this.commServerListener.get(castToCommServerUrl(commServerUrl));
        if (keyListenerMap === undefined) {
            throw new Error(
                'Failed to stop listening for commserver connections, the refcount is already' +
                    ' down to 0.'
            );
        }

        const keyEntry = keyListenerMap.get(castToLocalPublicKey(localPublicKey));
        if (keyEntry === undefined) {
            throw new Error('Programming error: No publicKey entry.');
        }

        keyEntry.referenceCount--;

        if (keyEntry.referenceCount === 0) {
            keyListenerMap.delete(castToLocalPublicKey(localPublicKey));
            if (keyListenerMap.keys().next().done) {
                this.commServerListener.delete(castToCommServerUrl(commServerUrl));
            }
            keyEntry.listener.stop();
        }
    }

    /**
     * Listen for direct connections.
     *
     * This function will start a listening websocket server only the first time this function
     * is called with the same host / port / localPublicKey options. All following calls will
     * just increase a reference counter, but not start a listening
     *
     * @param host
     * @param port
     * @param localPublicKey
     * @param encrypt
     * @param decrypt
     * @param listenerIdPrefix - The prefix to add before the listener id
     */
    public async listenForDirectConnections(
        host: string,
        port: number,
        localPublicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array,
        listenerIdPrefix?: string
    ): Promise<() => Promise<void>> {
        MessageBus.send(
            'log',
            `listenForDirectConnections(${uint8arrayToHexString(localPublicKey)}, ${host}, ${port})`
        );

        // Direct connections are not allowed to create the same listener for the same host /
        // port. This would lead to a EADDRINUSE error. It still might if you use e.g. localhost
        // and 127.0.0.1, but let's ignore this for now.
        // This will therefore be the key in the map to lookup listeners.
        const listenerInfo = this.webSocketListener.get(castToHostPort(host, port));

        if (listenerInfo === undefined) {
            this.webSocketListener.set(
                castToHostPort(host, port),
                await this.startNewWebsocketListener(
                    host,
                    port,
                    localPublicKey,
                    encrypt,
                    decrypt,
                    IncomingConnectionManager.directConnectionListenerId(
                        host,
                        port,
                        listenerIdPrefix
                    )
                )
            );
        } else {
            const publicKeyRefcount = listenerInfo.registeredPublicKeys.get(
                castToLocalPublicKey(localPublicKey)
            );

            if (publicKeyRefcount === undefined) {
                listenerInfo.registeredPublicKeys.set(castToLocalPublicKey(localPublicKey), {
                    referenceCount: 1
                });
            } else {
                publicKeyRefcount.referenceCount++;
            }
        }

        return async () => {
            await this.stopListeningForDirectConnections(host, port, localPublicKey);
        };
    }

    async stopListeningForDirectConnections(
        host: string,
        port: number,
        localPublicKey: Uint8Array
    ): Promise<void> {
        const listenerInfo = this.webSocketListener.get(castToHostPort(host, port));

        if (listenerInfo === undefined) {
            throw new Error(
                'Failed to stop listening for direct connections, the refcount is already down' +
                    ' to 0.'
            );
        }

        const publicKeyRefcount = listenerInfo.registeredPublicKeys.get(
            castToLocalPublicKey(localPublicKey)
        );

        if (publicKeyRefcount === undefined) {
            throw new Error('We do not listen for this public key.');
        }

        publicKeyRefcount.referenceCount--;

        if (publicKeyRefcount.referenceCount === 0) {
            listenerInfo.registeredPublicKeys.delete(castToLocalPublicKey(localPublicKey));
        }

        if (listenerInfo.registeredPublicKeys.size === 0) {
            this.webSocketListener.delete(castToHostPort(host, port));
            await listenerInfo.listener.stop();
        }
    }

    /**
     * Shutdown the listeners.
     *
     * This does not shutdown the already established encrypted connections, it just shuts down
     * the listeners.
     */
    public async shutdown(): Promise<void> {
        MessageBus.send('log', 'shutdown()');
        for (const [commServerUrl, keyListenerMap] of this.commServerListener.entries()) {
            for (const [localPublicKey, listenerInfo] of keyListenerMap.entries()) {
                MessageBus.send(
                    'log',
                    `Shutdown comm server listener: ${commServerUrl}/${localPublicKey}`
                );
                listenerInfo.listener.stop();
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
        connection: Connection,
        allowedPublicKeys: PublicKey[],
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array,
        listenerId: string
    ): Promise<void> {
        MessageBus.send('log', `${connection.id}: Accepted WebSocket`);
        try {
            const conn = await acceptWithEncryption(
                connection,
                allowedPublicKeys,
                encrypt,
                decrypt
            );

            // Step 6: E2E encryption is setup correctly. Pass the connection to a listener.
            this.onConnection.emit(conn.connection, conn.myKey, conn.remoteKey, listenerId);
        } catch (e) {
            MessageBus.send('log', `${connection.id}: ${e}`);
            connection.close();
            throw e;
        }
    }

    public async startNewCommunicationServerListener(
        commServerUrl: string,
        localPublicKey: PublicKey,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array,
        listenerId: string
    ): Promise<CommServerListenerInfo> {
        const listener = new CommunicationServerListener(2, 10000, encrypt, decrypt);
        listener.onConnection((connection: Connection) => {
            this.acceptConnection(connection, [localPublicKey], encrypt, decrypt, listenerId).catch(
                console.error
            );
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
        await listener.start(commServerUrl, localPublicKey);

        return {
            listener,
            referenceCount: 1
        };
    }

    private async startNewWebsocketListener(
        host: string,
        port: number,
        localPublicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array,
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array,
        listenerId: string
    ): Promise<WebSocketListenerInfo> {
        // This is the map that will be extended / shrunk later when we listen or stop
        // listening for new public keys.
        const registeredPublicKeys = new Map<LocalPublicKey, {referenceCount: number}>([
            [castToLocalPublicKey(localPublicKey), {referenceCount: 1}]
        ]);

        // Create and start listener
        const listener = new WebSocketListener();
        listener.onConnection((connection: Connection) => {
            this.acceptConnection(
                connection,
                [...registeredPublicKeys.keys()].map(key => ensurePublicKey(hexToUint8Array(key))),
                encrypt,
                decrypt,
                listenerId
            ).catch(console.error);
        });
        await listener.start(host, port);

        // Construct listenerInfo
        return {
            listener,
            registeredPublicKeys
        };
    }
}

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
