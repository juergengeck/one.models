import type {LeuteModel} from '../models';
import type {OneInstanceEndpoint} from '../recipes/Leute/CommunicationEndpoints';
import {
    castToLocalPublicKey,
    castToRemotePublicKey
} from './ConnectionEstablishment/ConnectionGroupMap';
import type {LocalPublicKey} from './ConnectionEstablishment/ConnectionGroupMap';
import ConnectionRouteManager from './ConnectionEstablishment/ConnectionRouteManager';
import {OEvent} from './OEvent';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Instance, Person} from '@refinio/one.core/lib/recipes';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type Connection from './Connection/Connection';
import type {CryptoApi} from '@refinio/one.core/lib/crypto/CryptoApi';
import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {ensurePublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import {getLocalInstanceOfPerson, hasPersonLocalInstance} from './instance';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';
import {isPersonComplete} from './person';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';

const MessageBus = createMessageBus('CommunicationModule');

export type LocalInstanceInfo = {
    personId: SHA256IdHash<Person>; // Id of person
    instanceId: SHA256IdHash<Instance>; // Id of corresponding local instance
    instanceCryptoApi: CryptoApi; // Crypto api
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
    catchAll?: boolean;
};

export type SocketConfiguration = {
    type: 'socket';
    host: string; // host to bind to
    port: number; // port to use
    url: string; // Url on how to connect to us - used to check if access is allowed
    catchAll?: boolean;
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
};

type PeerId = string & {
    _: 'OneInstanceEndpointId';
};

function createPeerId(
    localPublicKey: PublicKey,
    remotePublicKey: PublicKey,
    connectionGroupName: string
): PeerId {
    return `localKey: ${castToLocalPublicKey(localPublicKey)}, remoteKey: ${castToRemotePublicKey(
        remotePublicKey
    )}, groupName: ${connectionGroupName}` as PeerId;
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
export default class LeuteConnectionsModule {
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

    private initialized: boolean; // Flag that stores whether this module is initialized
    private readonly config: CommunicationModuleConfiguration;
    private readonly leuteModel: LeuteModel; // Contact model for getting contact objects
    private readonly connectionRouteManager: ConnectionRouteManager; // Manager for incoming

    // Internal maps and lists (dynamic)
    public readonly knownPeerMap: Map<PeerId, OneInstanceEndpoint>;
    private readonly unknownPeerMap: Map<string, Connection>; // Stores unknown peers - Map from srcKey + dstKey
    private readonly myPublicKeyToInstanceInfoMap: Map<LocalPublicKey, LocalInstanceInfo>; // A map
    // from my public instance key to my id - used to map the public key of the new connection to my ids

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
                      }
        };

        this.leuteModel = leuteModel;
        this.connectionRouteManager = new ConnectionRouteManager(
            this.config.outgoingConnectionConfiguration.enabled
                ? this.config.outgoingConnectionConfiguration.reconnectDelay
                : 5000
        );

        this.knownPeerMap = new Map<PeerId, OneInstanceEndpoint>();
        this.unknownPeerMap = new Map<string, Connection>();

        this.myPublicKeyToInstanceInfoMap = new Map<LocalPublicKey, LocalInstanceInfo>();

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

            this.setupRoutes().catch(console.trace);
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

        await this.updateLocalInstancesMap();
        await this.setupRoutes();
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
        /*const mapKey = genMapKey(localPublicKey, remotePublicKey);
        this.unknownPeerMap.set(mapKey, conn);
        // const webSocket = conn.websocketPlugin().webSocket;
        conn.state.onEnterState(newState => {
            if (newState === 'closed') {
                this.unknownPeerMap.delete(mapKey);
            }
        });*/
    }

    /**
     * Return information about all known connections.
     *
     * @returns
     */
    public connectionsInfo(): ConnectionInfo[] {
        const connectionsInfo: ConnectionInfo[] = [];
        /*for (const container of this.knownPeerMap.values()) {
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
        }*/
        return connectionsInfo;
    }

    debugDump(header: string = ''): void {
        this.connectionRouteManager.debugDump(header);
    }

    /**
     * Set up a map with peers that we want to connect to. (this.knownPeerMap)
     */
    private async setupRoutes(): Promise<void> {
        // We could do this in a single Promise.all, but ... perhaps this will spam too much
        // connections wildly, so hard to debug - let's leave it like this at the moment
        for (const endpoint of await this.fetchOtherOneInstanceEndpointsFromLeute()) {
            await this.setupRoutesForOneInstanceEndpoint(endpoint.instanceEndpoint);
        }

        // Setup incoming routes
        for (const myInfo of this.myPublicKeyToInstanceInfoMap.values()) {
            for (const config of this.config.incomingConnectionConfigurations) {
                if (!config.catchAll) {
                    continue;
                }

                if (config.type === 'commserver') {
                    this.connectionRouteManager.addIncomingWebsocketRouteCatchAll_CommServer(
                        myInfo.instanceCryptoApi,
                        config.url
                    );
                } else if (config.type === 'socket') {
                    this.connectionRouteManager.addIncomingWebsocketRouteCatchAll_Direct(
                        myInfo.instanceCryptoApi,
                        config.host,
                        config.port
                    );
                }
            }
        }

        // Notify the user of a change in connections
        this.onConnectionsChange.emit();
    }

    private async setupRoutesForOneInstanceEndpoint(remoteInstanceEndpoint: OneInstanceEndpoint) {
        const remoteInstanceKeys = await getObject(remoteInstanceEndpoint.instanceKeys);
        const remoteInstanceKey = ensurePublicKey(hexToUint8Array(remoteInstanceKeys.publicKey));

        // Create an outgoing connection for all of my identities
        for (const myInfo of this.myPublicKeyToInstanceInfoMap.values()) {
            const peerId = createPeerId(
                myInfo.instanceCryptoApi.publicEncryptionKey,
                remoteInstanceKey,
                remoteInstanceEndpoint.connectionGroupId || 'default'
            );

            if (this.knownPeerMap.get(peerId) !== undefined) {
                continue;
            }

            // Setup outgoing routes
            this.connectionRouteManager.addOutgoingWebsocketRoute(
                myInfo.instanceCryptoApi.createEncryptionApiWithKeysWith(remoteInstanceKey),
                remoteInstanceEndpoint.url,
                remoteInstanceEndpoint.connectionGroupId
            );

            // Setup incoming routes
            for (const config of this.config.incomingConnectionConfigurations) {
                if (config.type === 'commserver') {
                    this.connectionRouteManager.addIncomingWebsocketRoute_CommServer(
                        myInfo.instanceCryptoApi,
                        remoteInstanceKey,
                        config.url,
                        remoteInstanceEndpoint.connectionGroupId
                    );
                } else if (config.type === 'socket') {
                    this.connectionRouteManager.addIncomingWebsocketRoute_Direct(
                        myInfo.instanceCryptoApi,
                        remoteInstanceKey,
                        config.host,
                        config.port,
                        remoteInstanceEndpoint.connectionGroupId
                    );
                }
            }

            this.knownPeerMap.set(peerId, remoteInstanceEndpoint);
        }
    }

    private async fetchOtherOneInstanceEndpointsFromLeute(): Promise<
        {instanceEndpoint: OneInstanceEndpoint; isIom: boolean}[]
    > {
        const me = await this.leuteModel.me();
        const localInstances = await Promise.all(
            me.identities().map(async personId => {
                try {
                    return getLocalInstanceOfPerson(personId);
                } catch (_e) {
                    return undefined;
                }
            })
        );

        // My non local instanceEndpoints
        const myEndpoints = (await this.leuteModel.findAllOneInstanceEndpointsForMe(true))
            .map(instanceEndpoint => {
                return {
                    instanceEndpoint,
                    isIom: true
                };
            })
            .filter(info => localInstances.includes(info.instanceEndpoint.instanceId));

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

        /*if (!(await hasPersonLocalInstance(me))) {
            return;
        }*/

        await Promise.all(
            meSomeone.identities().map(async identity => {
                if (!(await isPersonComplete(identity))) {
                    return;
                }

                const instanceId = await getLocalInstanceOfPerson(identity);
                const keysHash = await getDefaultKeys(instanceId);
                const keys = await getObject(keysHash);

                this.myPublicKeyToInstanceInfoMap.set(keys.publicKey as LocalPublicKey, {
                    instanceId,
                    instanceCryptoApi: await createCryptoApiFromDefaultKeys(instanceId),
                    personId: identity
                });
            })
        );
    }

    // ######## Setup outgoing connections functions ########

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
        _routeId: string,
        _initiatedLocally: boolean
    ): void {
        const peerId = createPeerId(localPublicKey, remotePublicKey, connectionGroupName);

        const oneInstanceEndpoint = this.knownPeerMap.get(peerId);
        if (oneInstanceEndpoint === undefined) {
            conn.close(
                'Could not find a OneInstanceEndpoint for you. This seems like a programming' +
                    ' error or you were removed from contacts just as you tried to establish a' +
                    ' connection.'
            );
            return;
        }

        const myInfo = this.myPublicKeyToInstanceInfoMap.get(castToLocalPublicKey(localPublicKey));
        if (myInfo === undefined) {
            conn.close(
                'Could not find the person that you want to communicate with. This seems like a' +
                    ' programming error.'
            );
            return;
        }

        // Veri
    }

    private acceptConnectionCatchAll(
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionGroupName: string,
        routeId: string,
        initiatedLocally: boolean
    ): void {
        const myInfo = this.myPublicKeyToInstanceInfoMap.get(castToLocalPublicKey(localPublicKey));
        if (myInfo === undefined) {
            conn.close('Could not find the person that you want to communicate with.');
            return;
        }

        // Notify the outside
        this.onUnknownConnection.emit(
            conn,
            localPublicKey,
            remotePublicKey,
            myInfo.personId,
            initiatedLocally,
            connectionGroupName
        );
    }
}
