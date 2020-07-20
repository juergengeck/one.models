import {Instance, SHA256IdHash} from '@OneCoreTypes';
import {ContactModel} from '../models';
import OutgoingConnectionEstablisher from './OutgoingConnectionEstablisher';
import EncryptedConnection from './EncryptedConnection';
import {getObject} from 'one.core/lib/storage';
import {toByteArray} from 'base64-js';
import InstancesModel from '../models/InstancesModel';
import {createCrypto} from 'one.core/lib/instance-crypto';
import IncomingConnectionManager from './IncomingConnectionManager';

type ConnectionInfo = {
    connEst: OutgoingConnectionEstablisher;
    url: string;
    sourcePublicKey: string;
    targetPublicKey: string;
    sourceInstanceId: SHA256IdHash<Instance>;
    targetInstanceId:  SHA256IdHash<Instance>;
    cryptoApi: ReturnType<typeof createCrypto>;
};

function genMapKey(localPublicKey: Uint8Array, remotePublicKey: Uint8Array): string {
    return `${Buffer.from(localPublicKey).toString('hex')} + ${Buffer.from(remotePublicKey).toString('hex')}`;
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
    private outgoingMap: Map<string, ConnectionInfo>;   // Map from srcKey + dstKey
    private establishedConnections: Map<string, EncryptedConnection | null>;
    private incomingConnectionManager: IncomingConnectionManager;
    private commServer: string;

    public onUnknownConnection:
        | ((
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array
    ) => void)
        | null = null;

    public onKnownConnection:
        | ((
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array
    ) => void)
        | null = null;

    /**
     * Create instance.
     *
     * @param {ContactModel} contactModel
     */
    constructor(commServer: string, contactModel: ContactModel, instancesModel: InstancesModel) {
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
        this.outgoingMap = new Map<string, ConnectionInfo>();
        this.establishedConnections = new Map<string, EncryptedConnection | null>();
        this.incomingConnectionManager = new IncomingConnectionManager();
        this.commServer = commServer;

        this.incomingConnectionManager.onConnection = this.acceptConnection.bind(this);
    }

    /**
     * Initialize the communication.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        await this.setupOutgoingConnections();
        await this.setupIncomingConnections();
    }

    /**
     * Shotdown process
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        for (const v of this.outgoingMap.values()) {
            await v.connEst.stop();
        }
        await this.incomingConnectionManager.shutdown();
    }

    /**
     * Accept a new connection.
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     */
    private acceptConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array
    ): void {

        const mapKey = genMapKey(localPublicKey, remotePublicKey);

        // Check whether this is an unknown connection (no entry in the map)
        const mapEntry = this.establishedConnections.get(mapKey);
        console.log(mapKey, '->', mapEntry);
        for (const [k, v] of this.establishedConnections.entries()) {
            console.log(k, v === null ? 'null' : 'obj');
        }
        if(mapEntry === undefined) {
            if(this.onUnknownConnection) {
                this.onUnknownConnection(conn, localPublicKey, remotePublicKey);
            }
            return;
        }

        // Check whether this is a known connection (null in the map)
        if(mapEntry === null) {
            // Stop the outgoging establishment
            const endpoint = this.outgoingMap.get(mapKey);
            if(!endpoint) {
                conn.close('Internal error!')
                return;
            }

            // Stop the outgoing connection attempts
            endpoint.connEst.stop();

            // Handle the close events
            conn.webSocket.addEventListener('close', () => {
                // Restart the connection attempts
                endpoint.connEst.start(
                    endpoint.url,
                    localPublicKey,
                    remotePublicKey,
                    text => {
                        return endpoint.cryptoApi.encryptWithInstancePublicKey(remotePublicKey, text);
                    },
                    cypherText => {
                        return endpoint.cryptoApi.decryptWithInstancePublicKey(remotePublicKey, cypherText);
                    }
                );
            });
            if(this.onKnownConnection) {
                this.onKnownConnection(conn, localPublicKey, remotePublicKey);
            }
            this.establishedConnections.set(mapKey, conn);
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
        console.log('MY ENDPOINTS:', myEndpoints.length);
        const myOutgoingConnInfo = (
            await Promise.all(
                myEndpoints.map(async endpoint => {
                    const instanceKeys = await getObject(endpoint.instanceKeys);
                    return {
                        connEst: new OutgoingConnectionEstablisher(),
                        url: endpoint.url,
                        sourcePublicKey: mainInstanceKeys.publicKey,
                        targetPublicKey: instanceKeys.publicKey,
                        sourceInstanceId: mainInstance,
                        targetInstanceId: endpoint.instanceId,
                        cryptoApi: mainCrypto
                    };
                })
            )
        ).filter(info => info.sourcePublicKey !== mainInstanceKeys.publicKey);

        // Iterate over all contacts and connect with them (anonymous IDs)
        const otherEndpoints = await this.contactModel.findAllOneInstanceEndpoints(false);
        console.log('OTHER ENDPOINTS:', otherEndpoints.length, otherEndpoints);
        const otherOutgoingConnInfo = await Promise.all(
            otherEndpoints.map(async endpoint => {
                const instanceKeys = await getObject(endpoint.instanceKeys);
                return {
                    connEst: new OutgoingConnectionEstablisher(),
                    url: endpoint.url,
                    sourcePublicKey: anonInstanceKeys.publicKey,
                    targetPublicKey: instanceKeys.publicKey,
                    sourceInstanceId: anonInstance,
                    targetInstanceId: endpoint.instanceId,
                    cryptoApi: anonCrypto
                };
            })
        );
        console.log('MYCONN:' + myOutgoingConnInfo);
        console.log('OTHERCONN:' + otherOutgoingConnInfo);

        // Establish connections to all outgoing endpoints
        for (const endpoint of myOutgoingConnInfo.concat(otherOutgoingConnInfo)) {
            // Establish connection to the outside
            endpoint.connEst.onConnection = this.acceptConnection.bind(this);
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

            // Append to outgoing list
            const mapKey = genMapKey(sourceKey, targetKey);
            this.outgoingMap.set(mapKey, endpoint);

            // Also fill the established connections part
            // TODO: Should be somewhere else, because the replicant won't open outgoing connections!
            this.establishedConnections.set(mapKey, null);
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
    }

}
