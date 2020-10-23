import {Instance, Person, SHA256Hash, SHA256IdHash, OneInstanceEndpoint} from '@OneCoreTypes';
import {ContactModel} from '../models';
import OutgoingConnectionEstablisher from './OutgoingConnectionEstablisher';
import EncryptedConnection from './EncryptedConnection';
import {getObject} from 'one.core/lib/storage';
import {toByteArray, fromByteArray} from 'base64-js';
import InstancesModel, {LocalInstanceInfo} from '../models/InstancesModel';
import {createCrypto} from 'one.core/lib/instance-crypto';
import IncomingConnectionManager from './IncomingConnectionManager';
import {ContactEvent} from '../models/ContactModel';
import {EventEmitter} from 'events';

/**
 * This type represents information about a connection.
 *
 * It is used by functions that report the current state of connections to the user
 */
export type ConnectionInfo = {
    isConnected: boolean;
    url: string;
    sourcePublicKey: string;
    targetPublicKey: string;
    sourceInstanceId: SHA256IdHash<Instance>;
    targetInstanceId: SHA256IdHash<Instance>;
    sourcePersonId: SHA256IdHash<Person>;
    targetPersonId: SHA256IdHash<Person>;
    isInternetOfMe: boolean;
};

/**
 * This internal type stores all information tied to a connection.
 */
type ConnectionContainer = {
    connEst?: OutgoingConnectionEstablisher;
    activeConnection: EncryptedConnection | null;
    url: string;
    sourcePublicKey: string;
    targetPublicKey: string;
    sourceInstanceId: SHA256IdHash<Instance>;
    targetInstanceId: SHA256IdHash<Instance>;
    sourcePersonId: SHA256IdHash<Person>;
    targetPersonId: SHA256IdHash<Person>;
    cryptoApi: ReturnType<typeof createCrypto>;
    isInternetOfMe: boolean;
    dropDuplicates: boolean; // If this is true, duplicate connections will be dropped,
    // otherwise they will override the current connection
    // This flag will change automatically from true to false
    // after two seconds of an connection to be established.
    closeHandler?: () => void;
};

/**
 * Generate a string id for map entries based on public keys of both participants.
 *
 * @param {Uint8Array} localPublicKey
 * @param {Uint8Array} remotePublicKey
 * @returns {string}
 */
function genMapKey(localPublicKey: Uint8Array, remotePublicKey: Uint8Array): string {
    return `${Buffer.from(localPublicKey).toString('hex')} + ${Buffer.from(
        remotePublicKey
    ).toString('hex')}`;
}

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
export default class CommunicationModule extends EventEmitter {
    // Other models
    private readonly contactModel: ContactModel; // Contact model for getting contact objects
    private readonly instancesModel: InstancesModel; // Instance model for getting local instances
    private readonly incomingConnectionManager: IncomingConnectionManager; // Manager for incoming connections

    // Internal maps and lists (dynamic)
    private readonly knownPeerMap: Map<string, ConnectionContainer>; // Stores the known peers - Map from srcKey + dstKey
    private readonly unknownPeerMap: Map<string, EncryptedConnection>; // Stores unknown peers - Map from srcKey + dstKey
    private readonly reconnectHandles: Set<ReturnType<typeof setTimeout>>; // List of reconnect timer handles - used to clear on timeout

    // Internal maps and lists (precomputed on init)
    private mainInstanceInfo: LocalInstanceInfo | null; // My person info
    private anonInstanceInfo: LocalInstanceInfo | null; // My person info - anonymous id -> TODO: should be removed in the future
    private myPublicKeyToInstanceInfoMap: Map<string, LocalInstanceInfo>; // A map from my public keys to my id - used to map the public key of the new connection to my ids

    // Global settings
    private readonly commServer: string; // The comm server to use for incoming listening connections. This will be replaced by a instance based config.
    private readonly reconnectDelay: number; // The amount of time that should pass after a connection was closed before retrying to open it again
    private readonly establishOutgoingConnections: boolean; // Flag that stores whether outgoing connections should be established
    private readonly connectToOthersWithAnonId: boolean; // Flag that stores whether connections to others should be done via the anonymous id

    // State variables
    private initialized: boolean; // Flag that stores whether this module is initialized

    // Event that is emitted if an incoming connection was accepted, but the identity of the other side is not known
    public onUnknownConnection:
        | ((
              conn: EncryptedConnection,
              localPublicKey: Uint8Array,
              remotePublicKey: Uint8Array,
              localPersonId: SHA256IdHash<Person>,
              initiatedLocally: boolean
          ) => void)
        | null = null;

    // Event that is emitted if an incoming connection was accepted and the identity of the other side is known
    public onKnownConnection:
        | ((
              conn: EncryptedConnection,
              localPublicKey: Uint8Array,
              remotePublicKey: Uint8Array,
              localPersonId: SHA256IdHash<Person>,
              remotePersonId: SHA256IdHash<Person>,
              initiatedLocally: boolean
          ) => void)
        | null = null;

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns {boolean}
     */
    get onlineState(): boolean {
        return this.incomingConnectionManager.onlineState;
    }

    /**
     * Create instance.
     *
     * @param {string} commServer - The comm server that is used to listen for incoming connections
     *                              Outgoing connections are made based on the contact objects.
     * @param {ContactModel} contactModel - The contacts model. At the moment it is used to automatically
     *                                      establish connections to all known contacts.
     * @param {InstancesModel} instancesModel - Instances model used for getting the local instances and keys
     * @param {boolean} establishOutgoingConnections - If true then make outgoing connections, if false, then don't
     * @param {boolean} connectToOthersWithAnonId - If true then use the anonymous id for connecting with others
     * @param {number} reconnectDelay - The amount of time that needs to pass before another reconnection attempt is done when a connection is closed
     */
    constructor(
        commServer: string,
        contactModel: ContactModel,
        instancesModel: InstancesModel,
        establishOutgoingConnections: boolean = true,
        connectToOthersWithAnonId: boolean = true,
        reconnectDelay: number = 5000
    ) {
        super();

        // Initialize members
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
        this.incomingConnectionManager = new IncomingConnectionManager();

        this.knownPeerMap = new Map<string, ConnectionContainer>();
        this.unknownPeerMap = new Map<string, EncryptedConnection>();
        this.reconnectHandles = new Set<ReturnType<typeof setTimeout>>();

        this.mainInstanceInfo = null;
        this.anonInstanceInfo = null;
        this.myPublicKeyToInstanceInfoMap = new Map<string, LocalInstanceInfo>();

        this.commServer = commServer;
        this.reconnectDelay = reconnectDelay;
        this.establishOutgoingConnections = establishOutgoingConnections;
        this.connectToOthersWithAnonId = connectToOthersWithAnonId;

        this.initialized = false;

        // Setup incoming connection manager events
        this.incomingConnectionManager.onConnection = (
            conn: EncryptedConnection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array
        ) => {
            this.acceptConnection(conn, localPublicKey, remotePublicKey, false);
        };

        this.incomingConnectionManager.onOnlineStateChange = (onlineState: boolean) => {
            this.emit('onlineStateChange', onlineState);
        };

        // Setup event for instance creation
        this.instancesModel.on('created_instance', instance => {
            if (!this.initialized) {
                return;
            }

            this.setupIncomingConnectionsForInstance(instance).catch(e => console.log(e));
            this.updateInstanceInfos().catch(e => console.log(e));
        });

        // Setup event for new contact objects on contact management
        this.contactModel.on(
            ContactEvent.NewCommunicationEndpointArrived,
            async (endpointHashes: SHA256Hash<OneInstanceEndpoint>[]) => {
                if (!this.initialized) {
                    return;
                }
                if (!this.mainInstanceInfo) {
                    console.log(
                        'AN ERROR HAPPENED HERE. ME IS NOT INITIALIZED, SHOULD NEVER HAPPEN!!!'
                    );
                    return;
                }
                if (!this.anonInstanceInfo) {
                    console.log(
                        'AN ERROR HAPPENED HERE. ME-ANON IS NOT INITIALIZED, SHOULD NEVER HAPPEN!!!'
                    );
                    return;
                }
                const mainInstanceInfo = this.mainInstanceInfo;
                const anonInstanceInfo = this.anonInstanceInfo;
                const myIds = await this.contactModel.myIdentities();

                // Load the OneInstanceEndpoint objects
                const endpoints = await Promise.all(
                    endpointHashes.map((endpointHash: SHA256Hash<OneInstanceEndpoint>) =>
                        getObject(endpointHash)
                    )
                );

                // Only OneInstanceEndpoints
                // For my own contact objects, just use the one for the main id. We don't want to connect to our own anonymous id
                const instanceEndpoints = endpoints.filter((endpoint: OneInstanceEndpoint) => {
                    return (
                        endpoint.$type$ === 'OneInstanceEndpoint' &&
                        endpoint.personId !== anonInstanceInfo.personId
                    );
                });

                await Promise.all(
                    instanceEndpoints.map(async (endpoint: OneInstanceEndpoint) => {
                        const isMyEndpoint = myIds.includes(endpoint.personId);
                        const useMainId = isMyEndpoint || !this.connectToOthersWithAnonId;

                        // Load endpoint sub-elements
                        const remoteInstanceKeys = await getObject(endpoint.instanceKeys);
                        const sourceKey = toByteArray(
                            useMainId
                                ? mainInstanceInfo.instanceKeys.publicKey
                                : anonInstanceInfo.instanceKeys.publicKey
                        );
                        const targetKey = toByteArray(remoteInstanceKeys.publicKey);
                        const mapKey = genMapKey(sourceKey, targetKey);

                        // Check if there is already a matching active connection in the unknown peer maps
                        let activeConnection = this.unknownPeerMap.get(mapKey);
                        if (this.knownPeerMap.has(mapKey)) {
                            return;
                        }

                        // Create the entry in the knownPeerMap
                        const connContainer: ConnectionContainer = {
                            activeConnection: activeConnection ? activeConnection : null,
                            url: endpoint.url,
                            sourcePublicKey: useMainId
                                ? mainInstanceInfo.instanceKeys.publicKey
                                : anonInstanceInfo.instanceKeys.publicKey,
                            targetPublicKey: remoteInstanceKeys.publicKey,
                            sourceInstanceId: useMainId
                                ? mainInstanceInfo.instanceId
                                : anonInstanceInfo.instanceId,
                            targetInstanceId: endpoint.instanceId,
                            sourcePersonId: useMainId
                                ? mainInstanceInfo.personId
                                : anonInstanceInfo.personId,
                            targetPersonId: endpoint.personId,
                            cryptoApi: useMainId
                                ? mainInstanceInfo.cryptoApi
                                : anonInstanceInfo.cryptoApi,
                            isInternetOfMe: isMyEndpoint,
                            dropDuplicates: true
                        };
                        this.knownPeerMap.set(mapKey, connContainer);
                        this.emit('connectionsChange');

                        // If the connection is already active, then setup the close handler so that it is reactivated on close
                        if (activeConnection) {
                            this.unknownPeerMap.delete(mapKey);

                            // Handle the close events
                            const closeHandler = () => {
                                connContainer.dropDuplicates = true;
                                connContainer.activeConnection = null;
                                delete connContainer.closeHandler;
                                this.emit('connectionsChange');
                                this.reconnect(connContainer, this.reconnectDelay);
                            };
                            activeConnection.webSocket.addEventListener('close', closeHandler);
                            connContainer.closeHandler = closeHandler;
                        }

                        // If no active connection exists for this endpoint, then we need to start outgoing connections
                        else {
                            this.reconnect(connContainer, reconnectDelay);
                        }
                    })
                );
            }
        );
    }

    /**
     * Initialize the communication.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        this.initialized = true;

        // Setup internal data structures
        await this.updateInstanceInfos(); // Setup this.mainInstanceInfo and this.anonInstanceInfo and this.myPublicKeyToInstanceInfoMap
        await this.setupPeerMap(); // Setup this.knownPeerMap

        // Initiate setting up connections
        if (this.establishOutgoingConnections) {
            await this.setupOutgoingConnections();
        }
        await this.setupIncomingConnections();
    }

    /**
     * Shutdown process
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.initialized = false;
        await this.incomingConnectionManager.shutdown();

        // Stop all knownPeerMap connections
        for (const v of this.knownPeerMap.values()) {
            if (v.connEst) {
                await v.connEst.stop();
            }
            if (v.activeConnection) {
                await v.activeConnection.close();
            }
        }
        this.knownPeerMap.clear();

        // Kill all unknown peer map connections
        for (const v of this.unknownPeerMap.values()) {
            await v.close();
        }
        this.unknownPeerMap.clear();

        // Stop all reconnect timeouts
        for (const handle of this.reconnectHandles) {
            clearTimeout(handle);
        }
        this.reconnectHandles.clear();

        // Clear all other fields
        this.mainInstanceInfo = null;
        this.anonInstanceInfo = null;
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
     * @param {Uint8Array} localPublicKey - the local public key used to identify the connection
     * @param {Uint8Array} remotePublicKey - the remote public key used to identify the connection
     * @param {EncryptedConnection} conn - the connection
     */
    public addNewUnknownConnection(
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        conn: EncryptedConnection
    ): void {
        const mapKey = genMapKey(localPublicKey, remotePublicKey);
        this.unknownPeerMap.set(mapKey, conn);
        conn.webSocket.addEventListener('close', () => {
            this.unknownPeerMap.delete(mapKey);
        });
    }

    /**
     * Return information about all known connections.
     *
     * @returns {ConnectionInfo[]}
     */
    public connectionsInfo(): ConnectionInfo[] {
        const connectionsInfo: ConnectionInfo[] = [];
        for (const container of this.knownPeerMap.values()) {
            connectionsInfo.push({
                isConnected: container.activeConnection !== null,
                url: container.url,
                sourcePublicKey: Buffer.from(toByteArray(container.sourcePublicKey)).toString(
                    'hex'
                ),
                targetPublicKey: Buffer.from(toByteArray(container.targetPublicKey)).toString(
                    'hex'
                ),
                sourceInstanceId: container.sourceInstanceId,
                targetInstanceId: container.targetInstanceId,
                sourcePersonId: container.sourcePersonId,
                targetPersonId: container.targetPersonId,
                isInternetOfMe: container.isInternetOfMe
            });
        }
        return connectionsInfo;
    }

    // ######## Setup internal data structures ########

    /**
     * Set up a map with peers that we want to connect to. (this.knownPeerMap)
     */
    private async setupPeerMap(): Promise<void> {
        if (!this.mainInstanceInfo) {
            console.log(
                'setupPeerMap: AN ERROR HAPPENED HERE. ME IS NOT INITIALIZED, SHOULD NEVER HAPPEN!!!'
            );
            return;
        }
        if (!this.anonInstanceInfo) {
            console.log(
                'setupPeerMap: AN ERROR HAPPENED HERE. ME-ANON IS NOT INITIALIZED, SHOULD NEVER HAPPEN!!!'
            );
            return;
        }
        const mainInstanceInfo = this.mainInstanceInfo;
        const anonInstanceInfo = this.anonInstanceInfo;

        // Iterate over all personal contact objects and connect with all of them (real ID)
        const myEndpoints = await this.contactModel.findAllOneInstanceEndpoints(true, true);
        const myOutgoingConnInfo = (
            await Promise.all(
                myEndpoints.map(async endpoint => {
                    const instanceKeys = await getObject(endpoint.instanceKeys);
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: mainInstanceInfo.instanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: mainInstanceInfo.instanceId,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: mainInstanceInfo.personId,
                        targetPersonId: endpoint.personId,
                        cryptoApi: mainInstanceInfo.cryptoApi,
                        isInternetOfMe: true,
                        dropDuplicates: true
                    };
                })
            )
        ).filter(info => info.targetInstanceId !== mainInstanceInfo.instanceId);

        // Iterate over all contacts and connect with them (anonymous IDs)
        const otherEndpoints = await this.contactModel.findAllOneInstanceEndpoints(false);
        const otherOutgoingConnInfo = await Promise.all(
            otherEndpoints.map(async endpoint => {
                const instanceKeys = await getObject(endpoint.instanceKeys);
                if (this.connectToOthersWithAnonId) {
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: anonInstanceInfo.instanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: anonInstanceInfo.instanceId,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: anonInstanceInfo.personId,
                        targetPersonId: endpoint.personId,
                        cryptoApi: anonInstanceInfo.cryptoApi,
                        isInternetOfMe: false,
                        dropDuplicates: true
                    };
                } else {
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: mainInstanceInfo.instanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: mainInstanceInfo.instanceId,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: mainInstanceInfo.personId,
                        targetPersonId: endpoint.personId,
                        cryptoApi: mainInstanceInfo.cryptoApi,
                        isInternetOfMe: false,
                        dropDuplicates: true
                    };
                }
            })
        );

        // Fill all endpoints into this.knownPeerMap and this.establishedConnections
        for (const contactInfo of myOutgoingConnInfo.concat(otherOutgoingConnInfo)) {
            const sourceKey = toByteArray(contactInfo.sourcePublicKey);
            const targetKey = toByteArray(contactInfo.targetPublicKey);

            // Append to peer map
            const mapKey = genMapKey(sourceKey, targetKey);
            this.knownPeerMap.set(mapKey, contactInfo);
        }

        // Notify the user of a change in connections
        this.emit('connectionsChange');
    }

    /**
     * Updates all the instance info related members in the class.
     *
     * @returns {Promise<void>}
     */
    private async updateInstanceInfos(): Promise<void> {
        // Extract my local instance infos to build the map
        const infos = await this.instancesModel.localInstancesInfo();
        if (infos.length !== 2) {
            throw new Error('This applications needs exactly one alternate identity!');
        }

        // Setup the public key to instanceInfo map
        await Promise.all(
            infos.map(async instanceInfo => {
                this.myPublicKeyToInstanceInfoMap.set(
                    instanceInfo.instanceKeys.publicKey,
                    instanceInfo
                );
                if (instanceInfo.isMain) {
                    this.mainInstanceInfo = instanceInfo;
                } else {
                    this.anonInstanceInfo = instanceInfo;
                }
            })
        );
    }

    // ######## Setup outgoing connections functions ########

    /**
     * Initialize outgoing connections by triggering a reconnect on all known peers.
     *
     * @returns {Promise<void>}
     */
    private async setupOutgoingConnections(): Promise<void> {
        for (const endpoint of this.knownPeerMap.values()) {
            this.reconnect(endpoint, 0);
        }
    }

    /**
     * Reconnect to the target described by connContainer after a certain delay.
     *
     * @param {ConnectionContainer} connContainer - The information about the connection
     * @param {number} delay - the delay
     */
    private reconnect(connContainer: ConnectionContainer, delay: number) {
        if (!this.initialized) {
            return;
        }
        if (!this.establishOutgoingConnections) {
            return;
        }

        // This function does the connect
        const connect = () => {
            if (!this.initialized) {
                return;
            }
            if (!this.establishOutgoingConnections) {
                return;
            }

            // If outgoing connection establisher does not exist, then create one
            if (!connContainer.connEst) {
                connContainer.connEst = new OutgoingConnectionEstablisher();
                connContainer.connEst.onConnection = (
                    conn: EncryptedConnection,
                    localPublicKey: Uint8Array,
                    remotePublicKey: Uint8Array
                ) => {
                    this.acceptConnection(conn, localPublicKey, remotePublicKey, true);
                };
            }

            // Start outgoing connections
            connContainer.connEst.start(
                connContainer.url,
                toByteArray(connContainer.sourcePublicKey),
                toByteArray(connContainer.targetPublicKey),
                text => {
                    return connContainer.cryptoApi.encryptWithInstancePublicKey(
                        toByteArray(connContainer.targetPublicKey),
                        text
                    );
                },
                cypherText => {
                    return connContainer.cryptoApi.decryptWithInstancePublicKey(
                        toByteArray(connContainer.targetPublicKey),
                        cypherText
                    );
                }
            );
        };

        // Schedule the call delayed
        if (delay) {
            const handle = setTimeout(() => {
                this.reconnectHandles.delete(handle);
                connect();
            }, delay);
            this.reconnectHandles.add(handle);
        } else {
            connect();
        }
    }

    // ######## Setup incoming connections functions ########

    /**
     * Set up connection listeners for all local instances
     *
     * @returns {Promise<void>}
     */
    private async setupIncomingConnections(): Promise<void> {
        const localInstances = await this.instancesModel.localInstancesIds();
        for (const instance of localInstances) {
            await this.setupIncomingConnectionsForInstance(instance);
        }
    }

    /**
     * Setup incoming listener(s) for one specific local instance.
     *
     * @param {SHA256IdHash<Instance>} instance
     * @returns {Promise<void>}
     */
    private async setupIncomingConnectionsForInstance(
        instance: SHA256IdHash<Instance>
    ): Promise<void> {
        const keys = await this.instancesModel.localInstanceKeys(instance);
        const cryptoApi = createCrypto(instance);
        await this.incomingConnectionManager.listenForCommunicationServerConnections(
            this.commServer,
            toByteArray(keys.publicKey),
            (key, text) => {
                return cryptoApi.encryptWithInstancePublicKey(key, text);
            },
            (key, cypherText) => {
                return cryptoApi.decryptWithInstancePublicKey(key, cypherText);
            }
        );
    }

    /**
     * Accept a new connection.
     *
     * This is used for incoming as well as outgoing connections.
     *
     * @param {EncryptedConnection} conn - The encrypted connection that was accepted.
     * @param {Uint8Array} localPublicKey - The public key of the local instance
     * @param {Uint8Array} remotePublicKey - The public key of the remote peer
     * @param {boolean} initiatedLocally - If outgoing connection, then this should be set to true, otherwise false
     */
    private acceptConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        initiatedLocally: boolean
    ): void {
        const mapKey = genMapKey(localPublicKey, remotePublicKey);

        // Check whether this is an unknown connection (no entry in the map)
        const endpoint = this.knownPeerMap.get(mapKey);
        if (endpoint === undefined) {
            const localPersonInfo = this.myPublicKeyToInstanceInfoMap.get(
                fromByteArray(localPublicKey)
            );
            if (!localPersonInfo) {
                conn.close('Local public key is unknown');
                return;
            }

            if (this.onUnknownConnection) {
                if (this.unknownPeerMap.has(mapKey)) {
                    conn.close('duplicate connection');
                    return;
                }

                // register this connection on an internal list, so that when a new contact object arrives we can take this
                // connection as activeConnection, so that we don't establish a second connection
                this.unknownPeerMap.set(mapKey, conn);
                conn.webSocket.addEventListener('close', () => {
                    this.unknownPeerMap.delete(mapKey);
                });

                // Notify the listeners that we have an unknown connection
                this.onUnknownConnection(
                    conn,
                    localPublicKey,
                    remotePublicKey,
                    localPersonInfo.personId,
                    initiatedLocally
                );
            } else {
                conn.close('no one listens on unknown connections.');
            }
            return;
        }

        // Check whether this is a known connection (null in the map)
        if (endpoint.activeConnection === null) {
            // Stop the outgoing connection attempts
            if (endpoint.connEst) {
                endpoint.connEst.stop().catch(e => console.log(e));
            }

            // Connect close handler
            const closeHandler = () => {
                endpoint.dropDuplicates = true;
                endpoint.activeConnection = null;
                delete endpoint.closeHandler;
                this.emit('connectionsChange');
                this.reconnect(endpoint, this.reconnectDelay);
            };
            conn.webSocket.addEventListener('close', closeHandler);
            endpoint.closeHandler = closeHandler;

            // Set the current connection as active connection
            endpoint.activeConnection = conn;
            this.emit('connectionsChange');

            // Set timeout that changes duplicate connection behavior
            setTimeout(() => {
                endpoint.dropDuplicates = false;
            }, 2000);

            // Notify the outside
            if (this.onKnownConnection) {
                this.onKnownConnection(
                    conn,
                    localPublicKey,
                    remotePublicKey,
                    endpoint.sourcePersonId,
                    endpoint.targetPersonId,
                    initiatedLocally
                );
            }
            return;
        }

        // Close if already a connection exists
        // Based on the dropDuplicates we either drop the new connection  (before 2 seconds of initial connection establishment).
        // or the old one and replace it by the new one (after 2 seconds of initial connection establishment).
        if (endpoint.dropDuplicates) {
            conn.close('duplicate connection');
        } else {
            if (endpoint.closeHandler) {
                conn.webSocket.removeEventListener('close', endpoint.closeHandler);
            } else {
                throw new Error('closeHandler is out of sync with activeConnection');
            }
            endpoint.activeConnection.close('duplicate connection');
            endpoint.activeConnection = conn;
        }
    }
}
