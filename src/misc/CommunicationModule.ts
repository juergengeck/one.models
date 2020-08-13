import {Instance, Person, SHA256Hash, SHA256IdHash, OneInstanceEndpoint} from '@OneCoreTypes';
import {ContactModel} from '../models';
import OutgoingConnectionEstablisher from './OutgoingConnectionEstablisher';
import EncryptedConnection from './EncryptedConnection';
import {getObject} from 'one.core/lib/storage';
import {toByteArray, fromByteArray} from 'base64-js';
import InstancesModel from '../models/InstancesModel';
import {createCrypto} from 'one.core/lib/instance-crypto';
import IncomingConnectionManager from './IncomingConnectionManager';
import {ContactEvent} from '../models/ContactModel';


export type ConnectionInfo = {
    isConnected: boolean;
    url: string;
    sourcePublicKey: string;
    targetPublicKey: string;
    sourceInstanceId: SHA256IdHash<Instance>;
    targetInstanceId: SHA256IdHash<Instance>;
    sourcePersonId: SHA256IdHash<Person>;
    targetPersonId: SHA256IdHash<Person>;
}

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
};

function genMapKey(localPublicKey: Uint8Array, remotePublicKey: Uint8Array): string {
    return `${Buffer.from(localPublicKey).toString('hex')} + ${Buffer.from(
        remotePublicKey
    ).toString('hex')}`;
}

/**
 * This module manages all communication related stuff.
 *
 * What do we need to store?
 * 1) The configuration of our own instance -> leads to a contact object.
 * 2) The instance pairs that communicate with each other.
 *    - The information of keys comes from the contact objects of the contact management by iterating
 *      over all contact objects of a certain user. Instance endpoints are the right term.
 *    - For our own instances we can grab them from the contact management and automatically sync with them.
 *      No pairing Information for each instance required.
 *    - For other instances we could also connect with everybody / or we could compile a list of every
 *      possible connection and store for each possible connection wether we want to auto connect with them.
 *
 */
export default class CommunicationModule {
    private contactModel: ContactModel;
    private instancesModel: InstancesModel;
    private knownPeerMap: Map<string, ConnectionContainer>; // Map from srcKey + dstKey
    private unknownPeerMap: Map<string, EncryptedConnection>; // Map from srcKey + dstKey
    private myIdsMap: Map<string, SHA256IdHash<Person>>;
    private incomingConnectionManager: IncomingConnectionManager;
    private commServer: string;
    private initialized: boolean;
    private reconnectDelay: number;
    private reconnectHandles: Set<ReturnType<typeof setTimeout>>;

    public onUnknownConnection:
        | ((
              conn: EncryptedConnection,
              localPublicKey: Uint8Array,
              remotePublicKey: Uint8Array,
              localPersonId: SHA256IdHash<Person>,
              initiatedLocally: boolean
          ) => void)
        | null = null;

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
     * Event that is emitted when the online state changes
     */
    public onOnlineStateChange: ((online: boolean) => void) | null = null;

    /**
     * Event that is emitted when any connection changes (added, removed, is connected/disconnected)
     *
     * @type {null}
     */
    public onConnectionsChange: (() => void) | null = null

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

    private listenForOutgoingConnections: boolean;

    /**
     * Create instance.
     *
     * @param commServer
     * @param {ContactModel} contactModel
     * @param instancesModel
     * @param listenForOutgoingConnections
     */
    constructor(
        commServer: string,
        contactModel: ContactModel,
        instancesModel: InstancesModel,
        listenForOutgoingConnections: boolean = true,
        reconnectDelay: number = 5000
    ) {
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
        this.listenForOutgoingConnections = listenForOutgoingConnections;
        this.knownPeerMap = new Map<string, ConnectionContainer>(); // List with endpoints we want to connect to
        this.unknownPeerMap = new Map<string, EncryptedConnection>(); // List with endpoints we want to connect to
        this.myIdsMap = new Map<string, SHA256IdHash<Person>>();
        this.incomingConnectionManager = new IncomingConnectionManager();
        this.commServer = commServer;
        this.initialized = false;
        this.reconnectDelay = reconnectDelay;
        this.reconnectHandles = new Set<ReturnType<typeof setTimeout>>();

        this.incomingConnectionManager.onConnection = (
            conn: EncryptedConnection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array
        ) => {
            this.acceptConnection(conn, localPublicKey, remotePublicKey, false);
        };

        this.incomingConnectionManager.onOnlineStateChange = (onlineState: boolean) => {
            if (this.onOnlineStateChange) {
                this.onOnlineStateChange(onlineState);
            }
        };

        // Register handler for new local instances
        this.instancesModel.on('created_instance', instance => {
            if (!this.initialized) {
                return;
            }

            this.setupIncomingConnectionsForInstance(instance);
            this.updateMyIdsMap().catch(e => console.log(e));
        });

        // Register handler for new contacts
        this.contactModel.on(
            ContactEvent.NewCommunicationEndpointArrived,
            async (endpointHashes: SHA256Hash<OneInstanceEndpoint>[]) => {
                if (!this.initialized) {
                    return;
                }

                // Load the OneInstanceEndpoint objects
                const endpoints = await Promise.all(
                    endpointHashes.map((endpointHash: SHA256Hash<OneInstanceEndpoint>) =>
                        getObject(endpointHash)
                    )
                );

                // Extract my identities
                const me = await this.contactModel.myMainIdentity();
                const myIds = await this.contactModel.myIdentities();
                const meAlternates = (await this.contactModel.myIdentities()).filter(
                    id => id !== me
                );
                if (meAlternates.length !== 1) {
                    throw new Error('This applications needs exactly one alternate identity!');
                }
                const meAnon = meAlternates[0];

                // Get instances
                const mainInstance = await this.instancesModel.localInstanceIdForPerson(me);
                const anonInstance = await this.instancesModel.localInstanceIdForPerson(meAnon);

                // Get keys
                const mainInstanceKeys = await this.instancesModel.instanceKeysForPerson(me);
                const anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(meAnon);

                // Instantiate crypto API
                const mainCrypto = createCrypto(mainInstance);
                const anonCrypto = createCrypto(anonInstance);

                // Only OneInstanceEndpoints
                // For my own contact objects, just use the one for the main id. We don't want to connect to our own anonymous id
                const instanceEndpoints = endpoints.filter(
                    (endpoint: OneInstanceEndpoint) =>
                        endpoint.$type$ === 'OneInstanceEndpoint' && endpoint.personId !== meAnon
                );

                await Promise.all(
                    instanceEndpoints.map(async (endpoint: OneInstanceEndpoint) => {
                        // Check whether this is an endpoint for me or for somebody else
                        const isMyEndpoint =
                            myIds.includes(endpoint.personId) || !this.listenForOutgoingConnections;

                        const remoteInstanceKeys = await getObject(endpoint.instanceKeys);
                        const sourceKey = toByteArray(
                            isMyEndpoint ? mainInstanceKeys.publicKey : anonInstanceKeys.publicKey
                        );
                        const targetKey = toByteArray(remoteInstanceKeys.publicKey);
                        const mapKey = genMapKey(sourceKey, targetKey);

                        // Check if there is already a matching active connection in the unknown peer maps
                        let activeConnection = this.unknownPeerMap.get(mapKey);
                        if (this.knownPeerMap.has(mapKey)) {
                            return;
                        }

                        // Create the entry in the knownPeerMap
                        const connInfo = {
                            activeConnection: activeConnection ? activeConnection : null,
                            url: endpoint.url,
                            sourcePublicKey: isMyEndpoint
                                ? mainInstanceKeys.publicKey
                                : anonInstanceKeys.publicKey,
                            targetPublicKey: remoteInstanceKeys.publicKey,
                            sourceInstanceId: isMyEndpoint ? mainInstance : anonInstance,
                            targetInstanceId: endpoint.instanceId,
                            sourcePersonId: isMyEndpoint ? me : meAnon,
                            targetPersonId: endpoint.personId,
                            cryptoApi: isMyEndpoint ? mainCrypto : anonCrypto
                        };
                        this.knownPeerMap.set(mapKey, connInfo);

                        // Notify the user of a change in connections
                        if (this.onConnectionsChange) {
                            this.onConnectionsChange();
                        }

                        // If the connection is already active, then setup the close handler so that it is reactiveated on close
                        if (activeConnection) {
                            this.unknownPeerMap.delete(mapKey);

                            // Handle the close events
                            activeConnection.webSocket.addEventListener('close', () => {
                                connInfo.activeConnection = null;

                                // Notify the user of a change in connections
                                if (this.onConnectionsChange) {
                                    this.onConnectionsChange();
                                }

                                this.reconnect(connInfo, this.reconnectDelay);
                            });
                        }

                        // If no active connection exists for this endpoint, then we need to start outgoing connections
                        else {
                            this.reconnect(connInfo, reconnectDelay);
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
        await this.setupPeerMap();
        await this.updateMyIdsMap();
        if (this.listenForOutgoingConnections) {
            await this.setupOutgoingConnections();
        }
        await this.setupIncomingConnections();
    }

    /**
     * Shotdown process
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
        this.initialized = false;

        // Stop all knownPeerMap connections
        for (const v of this.knownPeerMap.values()) {
            if (v.connEst) {
                await v.connEst.stop();
            }
            if (v.activeConnection) {
                await v.activeConnection.close();
            }
        }

        // Kill all unknown peer map connections
        for (const v of this.unknownPeerMap.values()) {
            await v.close();
        }

        // Stop all reconnect timeouts
        for (const handle of this.reconnectHandles) {
            clearTimeout(handle);
        }

        // clear everything / reset to initial values
        await this.incomingConnectionManager.shutdown();
        this.knownPeerMap.clear();
        this.unknownPeerMap.clear();
        this.myIdsMap.clear();
        this.reconnectHandles.clear();
    }

    /**
     *
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param {EncryptedConnection} conn
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
     *
     * @returns {ConnectionInfo[]}
     */
    public connectionsInfo(): ConnectionInfo[] {
        const connectionsInfo: ConnectionInfo[] = [];
        for (const container of this.knownPeerMap.values()) {
            connectionsInfo.push({
                isConnected: container.activeConnection !== null,
                url: container.url,
                sourcePublicKey: container.sourcePublicKey,
                targetPublicKey: container.targetPublicKey,
                sourceInstanceId: container.sourceInstanceId,
                targetInstanceId: container.targetInstanceId,
                sourcePersonId: container.sourcePersonId,
                targetPersonId: container.targetPersonId
            });
        }
        return connectionsInfo;
    }

    /**
     * Update my own ids for unknown incoming connections.
     *
     * @returns {Promise<void>}
     */
    private async updateMyIdsMap(): Promise<void> {
        const me = await this.contactModel.myMainIdentity();
        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== me);
        const meAll = meAlternates.concat([me]);

        // retrieve public keys and store them in the map
        await Promise.all(
            meAll.map(async id => {
                const keys = await this.instancesModel.instanceKeysForPerson(id);
                this.myIdsMap.set(keys.publicKey, id);
            })
        );
    }

    /**
     * Accept a new connection.
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param initiatedLocally
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
            const localId = this.myIdsMap.get(fromByteArray(localPublicKey));
            if (!localId) {
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
                    localId,
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
            conn.webSocket.addEventListener('close', () => {
                endpoint.activeConnection = null;

                // Notify the user of a change in connections
                if (this.onConnectionsChange) {
                    this.onConnectionsChange();
                }

                this.reconnect(endpoint, this.reconnectDelay);
            });

            // Set the current connectino as active connection
            endpoint.activeConnection = conn;

            // Notify the user of a change in connections
            if (this.onConnectionsChange) {
                this.onConnectionsChange();
            }

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
        conn.close('duplicate connection');
    }

    /** Sets up everything for incoming connections.
     *
     * @returns {Promise<void>}
     */
    private async setupOutgoingConnections(): Promise<void> {
        for (const endpoint of this.knownPeerMap.values()) {
            this.reconnect(endpoint, 0);
        }
    }

    /**
     * Sets up everything for incoming connections.
     *
     * @returns {Promise<void>}
     */
    private async setupIncomingConnections(): Promise<void> {
        const localInstances = await this.instancesModel.localInstancesIds();
        for (const instance of localInstances) {
            await this.setupIncomingConnectionsForInstance(instance);
        }
    }

    private async setupIncomingConnectionsForInstance(
        instance: SHA256IdHash<Instance>
    ): Promise<void> {
        const keys = await this.instancesModel.instanceKeys(instance);
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
     * Set up a map with peers that we want to connect to. (this.knownPeerMap)
     */
    private async setupPeerMap(): Promise<void> {
        // Extract my identities
        const me = await this.contactModel.myMainIdentity();
        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== me);
        if (meAlternates.length !== 1) {
            throw new Error('This applications needs exactly one alternate identity!');
        }
        const meAnon = meAlternates[0];

        // Get instances
        const mainInstance = await this.instancesModel.localInstanceIdForPerson(me);
        const anonInstance = await this.instancesModel.localInstanceIdForPerson(meAnon);

        // Get keys
        const mainInstanceKeys = await this.instancesModel.instanceKeysForPerson(me);
        const anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(meAnon);

        // Instantiate crypto API
        const mainCrypto = createCrypto(mainInstance);
        const anonCrypto = createCrypto(anonInstance);

        // Iterate over all personal contact objects and connect with all of them (real ID)
        const myEndpoints = await this.contactModel.findAllOneInstanceEndpoints(true, true);
        const myOutgoingConnInfo = (
            await Promise.all(
                myEndpoints.map(async endpoint => {
                    const instanceKeys = await getObject(endpoint.instanceKeys);
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: mainInstanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: mainInstance,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: me,
                        targetPersonId: endpoint.personId,
                        cryptoApi: mainCrypto
                    };
                })
            )
        ).filter(info => info.targetInstanceId !== mainInstance);

        // Iterate over all contacts and connect with them (anonymous IDs)
        const otherEndpoints = await this.contactModel.findAllOneInstanceEndpoints(false);
        const otherOutgoingConnInfo = await Promise.all(
            otherEndpoints.map(async endpoint => {
                const instanceKeys = await getObject(endpoint.instanceKeys);
                // if it's not a replicant
                if (!this.listenForOutgoingConnections) {
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: mainInstanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: mainInstance,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: me,
                        targetPersonId: endpoint.personId,
                        cryptoApi: mainCrypto
                    };
                } else {
                    return {
                        activeConnection: null,
                        url: endpoint.url,
                        sourcePublicKey: anonInstanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: anonInstance,
                        targetInstanceId: endpoint.instanceId,
                        sourcePersonId: meAnon,
                        targetPersonId: endpoint.personId,
                        cryptoApi: anonCrypto
                    };
                }
            })
        );

        // Fill all endpoints into this.knownPeerMap and this.establishedConnections
        for (const endpoint of myOutgoingConnInfo.concat(otherOutgoingConnInfo)) {
            const sourceKey = toByteArray(endpoint.sourcePublicKey);
            const targetKey = toByteArray(endpoint.targetPublicKey);

            // Append to peer map
            const mapKey = genMapKey(sourceKey, targetKey);
            this.knownPeerMap.set(mapKey, endpoint);
        }

        // Notify the user of a change in connections
        if (this.onConnectionsChange) {
            this.onConnectionsChange();
        }
    }

    /**
     * Reconnect to the target described by connInfo adter a certain delay.
     *
     * @param {ConnectionContainer} connInfo - The information about the connection
     * @param {number} delay - the delay
     */
    private reconnect(connInfo: ConnectionContainer, delay: number) {
        if (!this.initialized) {
            return;
        }
        if (!this.listenForOutgoingConnections) {
            return;
        }

        // This function does the connect
        const connect = () => {
            if (!this.initialized) {
                return;
            }
            if (!this.listenForOutgoingConnections) {
                return;
            }

            // If outgoing connection establisher does not exist, then create one
            if (!connInfo.connEst) {
                connInfo.connEst = new OutgoingConnectionEstablisher();
                connInfo.connEst.onConnection = (
                    conn: EncryptedConnection,
                    localPublicKey: Uint8Array,
                    remotePublicKey: Uint8Array
                ) => {
                    this.acceptConnection(conn, localPublicKey, remotePublicKey, true);
                };
            }

            // Start outgoing connections
            connInfo.connEst.start(
                connInfo.url,
                toByteArray(connInfo.sourcePublicKey),
                toByteArray(connInfo.targetPublicKey),
                text => {
                    return connInfo.cryptoApi.encryptWithInstancePublicKey(
                        toByteArray(connInfo.targetPublicKey),
                        text
                    );
                },
                cypherText => {
                    return connInfo.cryptoApi.decryptWithInstancePublicKey(
                        toByteArray(connInfo.targetPublicKey),
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
}
