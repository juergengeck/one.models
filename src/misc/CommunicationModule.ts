import type {LeuteModel} from '../models';
import type {OneInstanceEndpoint} from '../recipes/Leute/CommunicationEndpoints';
import ConnectionRouteManager from './ConnectionEstablishment/ConnectionRouteManager';
import {OEvent} from './OEvent';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Instance, Person} from '@refinio/one.core/lib/recipes';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type Connection from './Connection/Connection';
import {connectWithEncryptionUntilSuccessful} from './ConnectionEstablishment/protocols/ConnectionSetup';
import type {CryptoApi} from '@refinio/one.core/lib/crypto/CryptoApi';
import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {ensurePublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import {getLocalInstanceOfPerson, hasPersonLocalInstance} from './instance';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';
import type {PublicSignKey} from '@refinio/one.core/lib/crypto/sign';
import {isPersonComplete} from './person';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';

const MessageBus = createMessageBus('CommunicationModule');

export type LocalInstanceInfo = {
    personId: SHA256IdHash<Person>; // Id of person
    instanceId: SHA256IdHash<Instance>; // Id of corresponding local instance
    instanceKeys: {
        publicEncryptionKey: PublicKey;
        publicSignKey: PublicSignKey;
    }; // Keys of corresponding local instance
    cryptoApi: CryptoApi; // Crypto api
};

/**
 * This type represents information about a connection.
 *
 * It is used by functions that report the current state of connections to the user
 */
export type ConnectionInfo = {
    isConnected: boolean;
    url: string;
    sourcePublicKey: HexString;
    targetPublicKey: HexString;
    sourceInstanceId: SHA256IdHash<Instance>;
    targetInstanceId: SHA256IdHash<Instance>;
    sourcePersonId: SHA256IdHash<Person>;
    targetPersonId: SHA256IdHash<Person>;
    isInternetOfMe: boolean;
};

/**
 * This internal type stores all information tied to a connection.
 */
type PeerInformation = {
    instancePublicKey: HexString;
    instanceId: SHA256IdHash<Instance>;
    personId: SHA256IdHash<Person>;
    isInternetOfMe: boolean;
};

export type CommserverConfiguration = {
    type: 'commserver';
    url: string;
};

export type SocketConfiguration = {
    type: 'socket';
    host: string; // host to bind to
    port: number; // port to use
    url: string; // Url on how to connect to us - used to check if access is allowed
};

export type IncomingConnectionConfiguration = CommserverConfiguration | SocketConfiguration;

export type OutgoingConnectionConfiguration =
    | {
          enabled: true;
          reconnectDelay: number;
      }
    | {
          enabled: false;
      };

export type CommunicationModuleConfiguration = {
    // The configuration for incoming connections
    // Default: An empty list => do not accept any incoming connections
    incomingConnectionConfigurations: IncomingConnectionConfiguration[];

    // The configuration for outgoing connections
    // Default: Use the defaults specified in OutgoingConnectionConfiguration
    outgoingConnectionConfiguration: OutgoingConnectionConfiguration;

    // Allows that multiple connections to the same instance work
    allowParallelConnections: boolean;
};

/**
 * This module manages all connection related stuff.
 *
 * The responsibilities are:
 * - Open connections to other instances based on the information found in the contact management
 * - Trying to reestablish connections when they are closed
 * - Match incoming connection to the information found in the contact management
 * - Notify the user of this class of new connections and whether we know the peer. (onKnown/UnknownConnection callback)
 *
 * Those points are not the responsibility of this class:
 * - Pairing new connections -> this can be done by the above level based on the known / unknown callbacks
 * - Doing anything after establishing an encrypted connection
 *
 * So the main focus of this class is to keep being connected to other known instances and to forward the unknown ones
 * (only incoming connections can be unknown) to the upper level.
 *
 * In the current implementation it does two things:
 * 1) Grab all local instances and listen for matching incoming connections via the passed communication server
 *    - Incoming connections from our own devices are always matched against our main id
 *    - Incoming connections from other devices are always matched against the first alternate id, with one exception:
 *      If outgoing connections are disabled we assume at the moment that we are a non anonymous server, so it
 *      matches against the main id.
 *    TODO: We have to match the connection against the id that we whitelisted for that person
 *          The current implementation is just a shortcut while we always communicate with others via our
 *          alternate id. Especially the switch to the main id based on outgoing connection flag is bad.
 * 2) Iterate over all instance endpoints of contact management and try to establish outgoing connections
 *    This is skipped if establishOutgoingConnections is set to false.
 *    - Connections to our own instances are only established via our main id, so endpoints to own instances
 *      with alternate ids are ignored.
 *    - Connections to other instances are always made with the first alternate id (to be always anonymous atm).
 *    TODO: Make the decision with which identity to connect to others based on which identity we exposed to somebody else.
 *
 * If any connection is established (outgoing or incoming) the onKnown/UnknownConnection callbacks are called.
 *
 * Emits Events:
 * - connectionChange - when any connection changes its state
 * - onlineStateChange - when the online state changed
 */
export default class CommunicationModule {
    /**
     *  Event is emitted when the state of the connector changes. The event contains the value of the online state.
     */
    public onOnlineStateChange = new OEvent<(state: boolean) => void>();
    /**
     * Event is emitted when a connection is established or closed.
     */
    public onConnectionsChange = new OEvent<() => void>();

    /**
     * Event that is emitted if an incoming connection was accepted, but the identity of the other side is not known
     */
    public onUnknownConnection = new OEvent<
        (
            conn: Connection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array,
            localPersonId: SHA256IdHash<Person>,
            initiatedLocally: boolean,
            connectionGroupName: string
        ) => void
    >();

    /**
     * Event that is emitted if an incoming connection was accepted and the identity of the other side is known
     */
    public onKnownConnection = new OEvent<
        (
            conn: Connection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array,
            localPersonId: SHA256IdHash<Person>,
            remotePersonId: SHA256IdHash<Person>,
            initiatedLocally: boolean,
            connectionGroupName: string
        ) => void
    >();

    // Other models
    private readonly leuteModel: LeuteModel; // Contact model for getting contact objects
    public readonly connectionRouteManager: ConnectionRouteManager; // Manager for incoming
    // connections

    // Internal maps and lists (dynamic)
    public readonly knownPeerMap: Map<HexString, OneInstanceEndpoint>; // Stores the known peers -
    // Map from srcKey + dstKey
    private readonly unknownPeerMap: Map<string, Connection>; // Stores unknown peers - Map from srcKey + dstKey

    // Internal maps and lists (precomputed on init)
    private mainInstanceInfo: LocalInstanceInfo | null; // My person info
    private myPublicKeyToInstanceInfoMap: Map<HexString, LocalInstanceInfo>; // A map from my
    // public instance key to my id - used to map the public key of the new connection to my ids

    // Global settings
    private readonly config: CommunicationModuleConfiguration;

    // State variables
    private initialized: boolean; // Flag that stores whether this module is initialized

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns
     */
    get onlineState(): boolean {
        return this.connectionRouteManager.onlineState;
    }

    /**
     * Create instance.
     * Outgoing connections are made based on the contact objects.
     *
     * @param leuteModel - The model managing all contacts. Used for deciding which
     * connections to establish.
     * @param config
     */
    constructor(leuteModel: LeuteModel, config: Partial<CommunicationModuleConfiguration>) {
        this.config = {
            incomingConnectionConfigurations:
                config.incomingConnectionConfigurations !== undefined
                    ? config.incomingConnectionConfigurations
                    : [],
            outgoingConnectionConfiguration:
                config.outgoingConnectionConfiguration !== undefined
                    ? config.outgoingConnectionConfiguration
                    : {
                          enabled: true,
                          reconnectDelay: 5000
                      },

            // Allows that multiple connections to the same instance work
            allowParallelConnections:
                config.allowParallelConnections !== undefined
                    ? config.allowParallelConnections
                    : false
        };

        // Initialize members
        this.leuteModel = leuteModel;
        this.connectionRouteManager = new ConnectionRouteManager(
            this.config.outgoingConnectionConfiguration.enabled
                ? this.config.outgoingConnectionConfiguration.reconnectDelay
                : 5000
        );

        this.knownPeerMap = new Map<HexString, OneInstanceEndpoint>();
        this.unknownPeerMap = new Map<string, Connection>();

        this.mainInstanceInfo = null;
        this.myPublicKeyToInstanceInfoMap = new Map<string, LocalInstanceInfo>();

        this.initialized = false;

        // Setup route manager events
        this.connectionRouteManager.onConnection(this.acceptConnection.bind(this));
        this.connectionRouteManager.onConnectionViaCatchAll(
            this.acceptConnectionCatchAll.bind(this)
        );

        this.connectionRouteManager.onOnlineStateChange((onlineState: boolean) => {
            this.onOnlineStateChange.emit(onlineState);
        });

        // Setup event for instance creation
        this.leuteModel.onUpdated(() => {
            if (!this.initialized) {
                return;
            }

            this.reconfigureConnections().catch(e => console.log(e));
        });

        // Setup event for new contact objects on contact management
        // At the moment this line is a bug, because it fires when OneInstanceEndpoints are
        // written, but the OneInstanceEndpoint is not yet in the tree of leute objects.
        /*this.leuteModel.onNewOneInstanceEndpointEvent(
            async (oneInstanceEndpoint: OneInstanceEndpoint) => {
                this.reconfigureConnections().catch(console.error);
            }
        );*/
        /*this.leuteModel.onNewOneInstanceEndpointEvent(
            async (oneInstanceEndpoint: OneInstanceEndpoint) => {
                try {
                    if (!this.initialized) {
                        return;
                    }
                    if (!this.mainInstanceInfo) {
                        console.log(
                            'AN ERROR HAPPENED HERE. ME IS NOT INITIALIZED, SHOULD NEVER HAPPEN!!!'
                        );
                        return;
                    }
                    const mainInstanceInfo = this.mainInstanceInfo;
                    const myIds = (await this.leuteModel.me()).identities();

                    // For my own contact objects, just use the one for the main id. We don't want to
                    // connect to our own anonymous id
                    if (
                        myIds.includes(oneInstanceEndpoint.personId) ||
                        mainInstanceInfo.personId === oneInstanceEndpoint.personId
                    ) {
                        return;
                    }

                    await this.setupRoutesForOneInstanceEndpoint(oneInstanceEndpoint);
                } catch (e) {
                    console.error('Error in onNewOneInstanceEndpointEvent handler', e);
                }
            }
        );*/
    }

    /**
     * Initialize the communication.
     */
    public async init(): Promise<void> {
        this.initialized = true;

        // Setup internal data structures
        await this.reconfigureConnections();
        // Setup internal data structures
        await this.updateInstanceInfos(); // Setup this.mainInstanceInfo and this.anonInstanceInfo and this.myPublicKeyToInstanceInfoMap
        //await this.setupRoutes(); // Setup this.knownPeerMap
        await this.connectionRouteManager.enableRoutes();
    }

    /**
     * Shutdown process
     */
    async shutdown(): Promise<void> {
        this.initialized = false;
        await this.connectionRouteManager.disableRoutes();

        // Clear all other fields
        this.unknownPeerMap.clear();
        this.knownPeerMap.clear();
        this.mainInstanceInfo = null;
        this.myPublicKeyToInstanceInfoMap.clear();
    }

    /**
     * Adds an already existing connection to the unknown list, so that it can then be
     * transferred to the known list, when the corresponding contact object arrives.
     *
     * This has one single purpose:
     * Consider you are currently pairing with a new instance. As soon as you exchange contact objects, this module
     * will start trying to make an outgoing connection, because it thinks that there is no connection. So you
     * have two choices:
     * 1) Kill the original connection and let the module establish a new one (probably hard to find the correct point in time)
     * 2) Give this module before synchronization of contact objects the connection, so that it knows it does not have to
     *    establish a new connection. --> This is what this function is for.
     *
     * @param localPublicKey - the local public key used to identify the connection
     * @param remotePublicKey - the remote public key used to identify the connection
     * @param conn - the connection
     */
    public addNewUnknownConnection(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        conn: Connection
    ): void {
        const mapKey = genMapKey(localPublicKey, remotePublicKey);
        this.unknownPeerMap.set(mapKey, conn);
        // const webSocket = conn.websocketPlugin().webSocket;
        conn.state.onEnterState(newState => {
            if (newState === 'closed') {
                this.unknownPeerMap.delete(mapKey);
            }
        });
    }

    /**
     * Replaces a known connection with a new one.
     *
     * @param localPublicKey - the local public key used to identify the connection
     * @param remotePublicKey - the remote public key used to identify the connection
     * @param conn - the connection
     * @param reason - the reason why to close the old connection
     */
    public replaceKnownConnection(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        conn: Connection,
        reason: string
    ): void {
        const mapKey = genMapKey(localPublicKey, remotePublicKey);
        const endpoint = this.knownPeerMap.get(mapKey);
        if (endpoint === undefined) {
            throw new Error('This is not a known connection.');
        }

        if (endpoint.activeConnection) {
            if (endpoint.disconnectCloseHandler) {
                endpoint.disconnectCloseHandler();
            }
            endpoint.activeConnection.close(reason);
        }

        // Stop the outgoing connection attempts
        if (endpoint.stopConnecting) {
            endpoint.stopConnecting();
            endpoint.stopConnecting = undefined;
        }

        // Connect close handler
        const closeHandler = () => {
            endpoint.dropDuplicates = true;
            endpoint.activeConnection = null;
            delete endpoint.closeHandler;
            this.emit('connectionsChange');
            this.onConnectionsChange.emit();
            this.reconnect(endpoint, this.reconnectDelay);
        };
        const disconnectCloseHandler = conn.state.onEnterState(newState => {
            if (newState === 'closed') {
                closeHandler();
            }
        });
        endpoint.closeHandler = closeHandler;
        endpoint.disconnectCloseHandler = disconnectCloseHandler;

        // Set the current connection as active connection
        endpoint.activeConnection = conn;
        if (endpoint.reconnectTimeoutHandle !== null) {
            clearTimeout(endpoint.reconnectTimeoutHandle);
            endpoint.reconnectTimeoutHandle = null;
        }

        this.emit('connectionsChange');
        this.onConnectionsChange.emit();

        // Set timeout that changes duplicate connection behavior
        setTimeout(() => {
            endpoint.dropDuplicates = false;
        }, 2000);
    }

    /**
     * Return information about all known connections.
     *
     * @returns
     */
    public connectionsInfo(): ConnectionInfo[] {
        const connectionsInfo: ConnectionInfo[] = [];
        for (const container of this.knownPeerMap.values()) {
            connectionsInfo.push({
                isConnected: container.activeConnection !== null,
                url: container.url,
                sourcePublicKey: uint8arrayToHexString(container.sourcePublicKey),
                targetPublicKey: uint8arrayToHexString(container.targetPublicKey),
                sourceInstanceId: container.sourceInstanceId,
                targetInstanceId: container.targetInstanceId,
                sourcePersonId: container.sourcePersonId,
                targetPersonId: container.targetPersonId,
                isInternetOfMe: container.isInternetOfMe
            });
        }
        return connectionsInfo;
    }

    debugDump(header: string = ''): void {
        this.connectionRouteManager.debugDump(header);
    }

    // ######## Setup internal data structures ########

    private async reconfigureConnections(): Promise<void> {
        await this.updatePeerMap();
        await this.updateLocalInstancesMap();

        // Initiate setting up connections
        if (this.establishOutgoingConnections) {
            await this.setupOutgoingConnections();
        }
        await this.setupIncomingConnections();
    }

    /**
     * Set up a map with peers that we want to connect to. (this.knownPeerMap)
     */
    private async setupRoutes(): Promise<void> {
        // Fill all endpoints into this.knownPeerMap and this.establishedConnections
        for (const endpoint of await this.fetchOtherOneInstanceEndpointsFromLeute()) {
            this.setupRoutesForOneInstanceEndpoint(endpoint.instanceEndpoint);
        }

        // Notify the user of a change in connections
        this.emit('connectionsChange');
        this.onConnectionsChange.emit();
    }

    async addOutgoingWebsocketRoute(oneInstanceEndpoint: OneInstanceEndpoint) {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized');
        }

        const remoteInstanceKeys = await getObject(oneInstanceEndpoint.instanceKeys);
        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        this.connectionRouteManager.addOutgoingWebsocketRoute(
            hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey),
            hexToUint8Array(remoteInstanceKeys.publicKey),
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            oneInstanceEndpoint.url,
            oneInstanceEndpoint.chumId || 'default'
        );

        this.knownPeerMap.set(remoteInstanceKeys.publicKey, oneInstanceEndpoint);
        await this.connectionRouteManager.enableRoutes();
    }

    async addIncomingWebsocketRoute_Direct(
        oneInstanceEndpoint: OneInstanceEndpoint,
        host: string,
        port: number,
        chumId?: string
    ) {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized');
        }

        const remoteInstanceKeys = await getObject(oneInstanceEndpoint.instanceKeys);
        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        this.connectionRouteManager.addIncomingWebsocketRoute_Direct(
            hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey),
            hexToUint8Array(remoteInstanceKeys.publicKey),
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            host,
            port,
            chumId || oneInstanceEndpoint.chumId || 'default'
        );

        this.knownPeerMap.set(remoteInstanceKeys.publicKey, oneInstanceEndpoint);
        await this.connectionRouteManager.enableRoutes();
    }

    async addIncomingWebsocketRoute_CommServer(
        oneInstanceEndpoint: OneInstanceEndpoint,
        commServerUrl: string,
        chumId?: string
    ) {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized');
        }

        const remoteInstanceKeys = await getObject(oneInstanceEndpoint.instanceKeys);
        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        this.connectionRouteManager.addIncomingWebsocketRoute_CommServer(
            hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey),
            hexToUint8Array(remoteInstanceKeys.publicKey),
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            commServerUrl,
            chumId || oneInstanceEndpoint.chumId || 'default'
        );

        this.knownPeerMap.set(remoteInstanceKeys.publicKey, oneInstanceEndpoint);
        await this.connectionRouteManager.enableRoutes();
    }

    async addIncomingWebsocketRouteCatchAll_Direct(host: string, port: number) {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized');
        }

        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        this.connectionRouteManager.addIncomingWebsocketRouteCatchAll_Direct(
            hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey),
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            host,
            port
        );

        await this.connectionRouteManager.enableRoutes();
    }

    async addIncomingWebsocketRouteCatchAll_CommServer(commServerUrl: string) {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized');
        }

        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        this.connectionRouteManager.addIncomingWebsocketRouteCatchAll_CommServer(
            hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey),
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            commServerUrl
        );

        await this.connectionRouteManager.enableRoutes();
    }

    private async setupRoutesForOneInstanceEndpoint(remoteInstanceEndpoint: OneInstanceEndpoint) {
        if (!this.mainInstanceInfo) {
            throw new Error(
                'otherOneInstanceEndpoints: AN ERROR HAPPENED HERE. ME IS NOT INITIALIZED, SHOULD' +
                    ' NEVER HAPPEN!!!'
            );
        }

        const remoteInstanceKeys = await getObject(remoteInstanceEndpoint.instanceKeys);

        const localInstanceKey = hexToUint8Array(this.mainInstanceInfo.instanceKeys.publicKey);
        const remoteInstanceKey = hexToUint8Array(remoteInstanceKeys.publicKey);
        const cryptoApi = this.mainInstanceInfo.cryptoApi;

        // Setup outgoing routes
        this.connectionRouteManager.addOutgoingWebsocketRoute(
            localInstanceKey,
            remoteInstanceKey,
            (remotePublicKey, text) => {
                return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
            },
            (remotePublicKey, cypher) => {
                return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
            },
            remoteInstanceEndpoint.url,
            remoteInstanceEndpoint.chumId || 'default'
        );

        // Setup incoming routes
        for (const config of this.config.incomingConnectionConfigurations) {
            if (config.type === 'commserver') {
                this.connectionRouteManager.addIncomingWebsocketRoute_CommServer(
                    localInstanceKey,
                    remoteInstanceKey,
                    (remotePublicKey, text) => {
                        return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
                    },
                    (remotePublicKey, cypher) => {
                        return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
                    },
                    config.url,
                    remoteInstanceEndpoint.chumId || 'default'
                );
            } else if (config.type === 'socket') {
                this.connectionRouteManager.addIncomingWebsocketRoute_Direct(
                    localInstanceKey,
                    remoteInstanceKey,
                    (remotePublicKey, text) => {
                        return cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
                    },
                    (remotePublicKey, cypher) => {
                        return cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypher);
                    },
                    config.host,
                    config.port,
                    remoteInstanceEndpoint.chumId || 'default'
                );
            }
        }
        this.knownPeerMap.set(uint8arrayToHexString(remoteInstanceKey), remoteInstanceEndpoint);
    }

    private async fetchOtherOneInstanceEndpointsFromLeute(): Promise<
        {instanceEndpoint: OneInstanceEndpoint; isIom: boolean}[]
    > {
        if (!this.mainInstanceInfo) {
            throw new Error(
                'otherOneInstanceEndpoints: AN ERROR HAPPENED HERE. ME IS NOT INITIALIZED, SHOULD' +
                    ' NEVER HAPPEN!!!'
            );
        }
        const mainInstanceInfo = this.mainInstanceInfo;

        // My non local instanceEndpoints
        const myEndpoints = (await this.leuteModel.findAllOneInstanceEndpointsForMe(true))
            .map(instanceEndpoint => {
                return {
                    instanceEndpoint,
                    isIom: true
                };
            })
            .filter(info => info.instanceEndpoint.instanceId !== mainInstanceInfo.instanceId);

        // Instance endpoints for all other instances / persons
        const otherEndpoints = (await this.leuteModel.findAllOneInstanceEndpointsForOthers()).map(
            instanceEndpoint => {
                return {
                    instanceEndpoint,
                    isIom: false
                };
            }
        );

        // Fill all endpoints into this.knownPeerMap and this.establishedConnections
        return myEndpoints.concat(otherEndpoints);
    }

    /**
     * Updates all the instance info related members in the class.
     */
    private async updateLocalInstancesMap(): Promise<void> {
        const meSomeone = await this.leuteModel.me();
        const me = await meSomeone.mainIdentity();

        if (!(await hasPersonLocalInstance(me))) {
            return;
        }

        await Promise.all(
            meSomeone.identities().map(async identity => {
                if (!(await isPersonComplete(identity))) {
                    return;
                }

                const instanceId = await getLocalInstanceOfPerson(identity);
                const keysHash = await getDefaultKeys(instanceId);
                const keys = await getObject(keysHash);

                this.myPublicKeyToInstanceInfoMap.set(keys.publicKey, {
                    instanceId,
                    cryptoApi: await createCryptoApiFromDefaultKeys(instanceId),
                    instanceKeys: await getPublicKeys(await getDefaultKeys(instanceId)),
                    personId: identity
                });
            })
        );
    }

    // ######## Setup outgoing connections functions ########

    /**
     * Initialize outgoing connections by triggering a reconnect on all known peers.
     */
    private async setupOutgoingConnections(): Promise<void> {
        for (const endpoint of this.knownPeerMap.values()) {
            this.reconnect(endpoint, 0);
        }
    }

    /**
     * Reconnect to the target described by connContainer after a certain delay.
     *
     * @param connContainer - The information about the connection
     * @param delay - the delay
     */
    private reconnect(connContainer: ConnectionContainer, delay: number) {
        if (!this.initialized) {
            return;
        }
        if (!this.establishOutgoingConnections) {
            return;
        }
        if (connContainer.activeConnection !== null) {
            return;
        }

        // This function does the connect
        const connect = async () => {
            if (!this.initialized) {
                return;
            }
            if (!this.establishOutgoingConnections) {
                return;
            }

            // Start outgoing connections
            const p = connectWithEncryptionUntilSuccessful(
                connContainer.url,
                connContainer.sourcePublicKey,
                connContainer.targetPublicKey,
                text => {
                    return connContainer.cryptoApi.encryptAndEmbedNonce(
                        text,
                        connContainer.targetPublicKey
                    );
                },
                cypherText => {
                    return connContainer.cryptoApi.decryptWithEmbeddedNonce(
                        cypherText,
                        connContainer.targetPublicKey
                    );
                }
            );

            connContainer.stopConnecting = () => {
                p.stop();
            };
            const connInfo = await p;
            this.acceptConnection(connInfo.connection, connInfo.myKey, connInfo.remoteKey, true);
        };

        // Schedule the call delayed
        if (delay) {
            if (connContainer.reconnectTimeoutHandle !== null) {
                return;
            }

            // Add a jitter on top of the timeout, so that both sides don't attempt connections
            // at the same time. If done properly this should not be necessary, but ... this was
            // the easy / fast fix to solve lots of duplicate connection errors.
            if (delay < 3000) {
                throw new Error(
                    'Reconnect timeouts must be larger than 3 seconds, because of' +
                        ' the jitter hack.'
                );
            }

            if (
                uint8arrayToHexString(connContainer.sourcePublicKey) <
                uint8arrayToHexString(connContainer.targetPublicKey)
            ) {
                delay = delay + 3000;
            }

            /*delay = delay + (Math.random() * 4000 - 2000);*/

            connContainer.reconnectTimeoutHandle = setTimeout(() => {
                connContainer.reconnectTimeoutHandle = null;
                connect().catch(_ => {
                    /* ignore this error - this is usually stopped by user */
                });
            }, delay);
        } else {
            connect().catch(_ => {
                /* ignore this error - this is usually stopped by user */
            });
        }
    }

    // ######## Setup incoming connections functions ########

    /**
     * Set up connection listeners for all local instances
     */
    private async setupIncomingConnections(): Promise<void> {
        const localInstances = await this.leuteModel.getMyLocalInstances();

        for (const localInstance of localInstances) {
            try {
                await this.setupIncomingConnectionsForInstance(localInstance);
            } catch (e) {
                console.error(
                    `Failure to setup connection for local instance ${localInstance.instanceId} of owner: ${localInstance.personId}`,
                    e
                );
            }
        }
    }

    /**
     * Setup incoming listener(s) for one specific local instance.
     *
     * @param instanceInfo
     */
    private async setupIncomingConnectionsForInstance(
        instanceInfo: LocalInstanceInfo
    ): Promise<void> {
        await this.incomingConnectionManager.listenForCommunicationServerConnections(
            this.commServer,
            instanceInfo.instanceKeys.publicEncryptionKey,
            (key, text) => {
                return instanceInfo.cryptoApi.encryptAndEmbedNonce(text, ensurePublicKey(key));
            },
            (key, cypherText) => {
                return instanceInfo.cryptoApi.decryptWithEmbeddedNonce(
                    cypherText,
                    ensurePublicKey(key)
                );
            }
        );
    }

    /**
     * Accept a new connection.
     *
     * This is used for incoming as well as outgoing connections.
     *
     * @param conn - The encrypted connection that was accepted.
     * @param localPublicKey - The public key of the local instance
     * @param remotePublicKey - The public key of the remote peer
     * @param connectionGroupName
     * @param routeId
     * @param initiatedLocally - If outgoing connection, then this should be set to true, otherwise false
     */
    private acceptConnection(
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionGroupName: string,
        routeId: string,
        initiatedLocally: boolean
    ): void {
        const mapKey = genMapKey(localPublicKey, remotePublicKey);

        // Check whether this is an unknown connection (no entry in the map)
        const endpoint = this.knownPeerMap.get(mapKey);
        if (endpoint === undefined) {
            const localPersonInfo = this.myPublicKeyToInstanceInfoMap.get(
                uint8arrayToHexString(localPublicKey)
            );
            if (!localPersonInfo) {
                conn.close('Local public key is unknown');
                return;
            }

            if (this.onUnknownConnection.listenerCount() === 0) {
                conn.close('no one listens on unknown connections.');
                return;
            }

            if (this.unknownPeerMap.has(mapKey)) {
                // when the connection is in the unknownPeerMap the same instance is already
                // trying to connect. This can happen when, in the first try, the connection
                // closed e.g. due to network loss.
                // To clean up we terminate the current connection. Which will remove the
                // probably orphaned connection from the unknownPeerMap.
                // The next try from the client will then run trough.
                conn.terminate('duplicate connection - drop new connection (unknown peer map)');
            }

            // register this connection on an internal list, so that when a new contact object arrives we can take this
            // connection as activeConnection, so that we don't establish a second connection
            this.unknownPeerMap.set(mapKey, conn);
            conn.state.onEnterState(newState => {
                if (newState === 'closed') {
                    this.unknownPeerMap.delete(mapKey);
                }
            });

            // Notify the listeners that we have an unknown connection
            this.onUnknownConnection.emit(
                conn,
                localPublicKey,
                remotePublicKey,
                localPersonInfo.personId,
                initiatedLocally
            );
            return;
        }

        // Here we know that the connection is known
        // Check if we have a duplicate situation.
        if (endpoint.activeConnection !== null) {
            // Check if we are in the 200ms window where we drop new connections
            if (endpoint.dropDuplicates) {
                // Close the new connection. No further action is required.
                conn.close('duplicate connection - drop new connection (<2000 ms window)');
                return;
            }

            //  If we replace the old connection, then
            //  Disconnect the close handler and close the old connection
            if (endpoint.disconnectCloseHandler) {
                endpoint.disconnectCloseHandler();
            } else {
                throw new Error('closeHandler is out of sync with activeConnection');
            }
            endpoint.activeConnection.close(
                'duplicate connection - drop old connection (>2000 ms window)'
            );
        }

        // Stop the outgoing connection attempts
        if (endpoint.stopConnecting) {
            endpoint.stopConnecting();
            endpoint.stopConnecting = undefined;
        }

        // Connect close handler
        const closeHandler = () => {
            endpoint.dropDuplicates = true;
            endpoint.activeConnection = null;
            delete endpoint.closeHandler;
            this.emit('connectionsChange');
            this.onConnectionsChange.emit();
            this.reconnect(endpoint, this.reconnectDelay);
        };
        const disconnectCloseHandler = conn.state.onEnterState(newState => {
            if (newState === 'closed') {
                closeHandler();
            }
        });
        endpoint.closeHandler = closeHandler;
        endpoint.disconnectCloseHandler = disconnectCloseHandler;

        // Set the current connection as active connection
        endpoint.activeConnection = conn;
        if (endpoint.reconnectTimeoutHandle !== null) {
            clearTimeout(endpoint.reconnectTimeoutHandle);
            endpoint.reconnectTimeoutHandle = null;
        }

        this.emit('connectionsChange');
        this.onConnectionsChange.emit();

        // Set timeout that changes duplicate connection behavior
        setTimeout(() => {
            endpoint.dropDuplicates = false;
        }, 2000);

        // Notify the outside
        this.onKnownConnection.emit(
            conn,
            localPublicKey,
            remotePublicKey,
            endpoint.sourcePersonId,
            endpoint.targetPersonId,
            initiatedLocally
        );
    }
}
