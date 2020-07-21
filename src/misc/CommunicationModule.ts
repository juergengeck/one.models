import {
    Instance,
    Person,
    SHA256Hash,
    SHA256IdHash,
    OneInstanceEndpoint
} from '@OneCoreTypes';
import {ContactModel} from '../models';
import OutgoingConnectionEstablisher from './OutgoingConnectionEstablisher';
import EncryptedConnection from './EncryptedConnection';
import {getObject} from 'one.core/lib/storage';
import {toByteArray, fromByteArray} from 'base64-js';
import InstancesModel from '../models/InstancesModel';
import {createCrypto} from 'one.core/lib/instance-crypto';
import IncomingConnectionManager from './IncomingConnectionManager';
import {ContactEvent} from '../models/ContactModel';

type ConnectionInfo = {
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
    private peerMap: Map<string, ConnectionInfo>; // Map from srcKey + dstKey
    private myIdsMap: Map<string, SHA256IdHash<Person>>;
    private incomingConnectionManager: IncomingConnectionManager;
    private commServer: string;

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
    private listenForOutgoingConnections: boolean;

    /**
     * Create instance.
     *
     * @param commServer
     * @param {ContactModel} contactModel
     * @param instancesModel
     * @param listenForOutgoingConnections
     */
    constructor(commServer: string, contactModel: ContactModel, instancesModel: InstancesModel, listenForOutgoingConnections: boolean = true) {
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
        this.listenForOutgoingConnections = listenForOutgoingConnections;
        this.peerMap = new Map<string, ConnectionInfo>(); // List with endpoints we want to connect to
        this.myIdsMap = new Map<string, SHA256IdHash<Person>>();
        this.incomingConnectionManager = new IncomingConnectionManager();
        this.commServer = commServer;

        this.incomingConnectionManager.onConnection = (
            conn: EncryptedConnection,
            localPublicKey: Uint8Array,
            remotePublicKey: Uint8Array
        ) => {
            this.acceptConnection(conn, localPublicKey, remotePublicKey, false);
        };
    }

    /**
     * Initialize the communication.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        await this.setupPeerMap();
        this.instancesModel.on('created_instance', instance => {
            this.setupIncomingConnectionsForInstance(instance);
            this.updateMyIdsMap().catch(e => console.log(e));
        });
        await this.updateMyIdsMap();
        this.contactModel.on(ContactEvent.NewCommunicationEndpointArrived, async (endpointHashes: SHA256Hash<OneInstanceEndpoint>[]) => {
            // Load the OneInstanceEndpoint objects
            const endpoints = await Promise.all(
                endpointHashes.map(
                    (
                        endpointHash: SHA256Hash<OneInstanceEndpoint>
                    ) => getObject(endpointHash)
                )
            );

            // Only OneInstanceEndpoints from other persons
            const myIds = await this.contactModel.myIdentities();
            const instanceEndpoints = endpoints.filter(
                (endpoint: OneInstanceEndpoint) => endpoint.$type$ === 'OneInstanceEndpoint' && !myIds.includes(endpoint.personId)
            );

            // Extract my identities
            const me = await this.contactModel.myMainIdentity();
            const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== me);
            if (meAlternates.length !== 1) {
                throw new Error('This applications needs exactly one alternate identity!');
            }
            const meAnon = meAlternates[0];

            // Get instances
            const anonInstance = await this.instancesModel.localInstanceIdForPerson(meAnon);

            // Get keys
            const anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(meAnon);

            // Instantiate crypto API
            const anonCrypto = createCrypto(anonInstance);

            await Promise.all(
                instanceEndpoints.map(
                    async (endpoint: OneInstanceEndpoint) => {
                        const keys = await getObject(endpoint.personKeys);

                        const sourceKey = toByteArray(anonInstanceKeys.publicKey);
                        const targetKey = toByteArray(keys.publicKey);
                        const mapKey = genMapKey(sourceKey, targetKey);

                        this.peerMap.set(mapKey, {
                            connEst: new OutgoingConnectionEstablisher(),
                            activeConnection: null,
                            url: endpoint.url,
                            sourcePublicKey: anonInstanceKeys.publicKey,
                            targetPublicKey: keys.publicKey,
                            sourceInstanceId: anonInstance,
                            targetInstanceId: endpoint.instanceId,
                            sourcePersonId: meAnon,
                            targetPersonId: endpoint.personId,
                            cryptoApi: anonCrypto
                        });
                    }
                )
            );
        });

        if(this.listenForOutgoingConnections) {
            await this.setupOutgoingConnections();
        }

        await this.setupIncomingConnections();
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
     * Shotdown process
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        for (const v of this.peerMap.values()) {
            if (v.connEst) {
                await v.connEst.stop();
            }
            if (v.activeConnection) {
                await v.activeConnection.close();
            }
        }
        await this.incomingConnectionManager.shutdown();
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
        const endpoint = this.peerMap.get(mapKey);
        if (endpoint === undefined) {
            const localId = this.myIdsMap.get(fromByteArray(localPublicKey));
            if (!localId) {
                conn.close('Local public key is unknown');
                return;
            }

            if (this.onUnknownConnection) {
                this.onUnknownConnection(
                    conn,
                    localPublicKey,
                    remotePublicKey,
                    localId,
                    initiatedLocally
                );

                // @todo
                // register this connection on an internal list, so that when a new contact object arrives we can take this
                // connection as activeConnection, so that we don't establish a second connection
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

            // Handle the close events
            conn.webSocket.addEventListener('close', () => {
                // Restart the connection attempts
                if (endpoint.connEst) {
                    endpoint.connEst.start(
                        endpoint.url,
                        localPublicKey,
                        remotePublicKey,
                        text => {
                            return endpoint.cryptoApi.encryptWithInstancePublicKey(
                                remotePublicKey,
                                text
                            );
                        },
                        cypherText => {
                            return endpoint.cryptoApi.decryptWithInstancePublicKey(
                                remotePublicKey,
                                cypherText
                            );
                        }
                    );
                }

                endpoint.activeConnection = null;
            });

            // Set the current connectino as active connection
            endpoint.activeConnection = conn;

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
        // Establish connections to all outgoing endpoints
        for (const endpoint of this.peerMap.values()) {
            // Create instance of connection establisher
            if (!endpoint.connEst) {
                endpoint.connEst = new OutgoingConnectionEstablisher();
            }

            // Establish connection to the outside
            endpoint.connEst.onConnection = (
                conn: EncryptedConnection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array
            ) => {
                this.acceptConnection(conn, localPublicKey, remotePublicKey, true);
            };

            // Start the connection establisher
            const sourceKey = toByteArray(endpoint.sourcePublicKey);
            const targetKey = toByteArray(endpoint.targetPublicKey);
            endpoint.connEst.start(
                endpoint.url,
                sourceKey,
                targetKey,
                text => {
                    return endpoint.cryptoApi.encryptWithInstancePublicKey(targetKey, text);
                },
                cypherText => {
                    return endpoint.cryptoApi.decryptWithInstancePublicKey(targetKey, cypherText);
                }
            );
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
     * Set up a map with peers that we want to connect to. (this.peerMap)
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
                        connEst: new OutgoingConnectionEstablisher(),
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
        ).filter(info => info.sourcePublicKey !== mainInstanceKeys.publicKey);

        // Iterate over all contacts and connect with them (anonymous IDs)
        const otherEndpoints = await this.contactModel.findAllOneInstanceEndpoints(false);
        const otherOutgoingConnInfo = await Promise.all(
            otherEndpoints.map(async endpoint => {
                const instanceKeys = await getObject(endpoint.instanceKeys);
                return {
                    connEst: new OutgoingConnectionEstablisher(),
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
            })
        );

        // Fill all endpoints into this.peerMap and this.establishedConnections
        for (const endpoint of myOutgoingConnInfo.concat(otherOutgoingConnInfo)) {
            const sourceKey = toByteArray(endpoint.sourcePublicKey);
            const targetKey = toByteArray(endpoint.targetPublicKey);

            // Append to peer map
            const mapKey = genMapKey(sourceKey, targetKey);
            this.peerMap.set(mapKey, endpoint);
        }
    }
}
