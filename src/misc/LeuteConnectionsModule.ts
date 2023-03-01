import type {LeuteModel} from '../models';
import type {OneInstanceEndpoint} from '../recipes/Leute/CommunicationEndpoints';
import {
    castToLocalPublicKey,
    castToRemotePublicKey
} from './ConnectionEstablishment/ConnectionRoutesGroupMap';
import type {LocalPublicKey} from './ConnectionEstablishment/ConnectionRoutesGroupMap';
import ConnectionRouteManager from './ConnectionEstablishment/ConnectionRouteManager';
import {exchangeInstanceIdObjects} from './ConnectionEstablishment/protocols/ExchangeInstanceIds';
import {verifyAndExchangePersonId} from './ConnectionEstablishment/protocols/ExchangePersonIds';
import {OEvent} from './OEvent';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Instance, Person} from '@refinio/one.core/lib/recipes';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {hexToUint8Array} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type Connection from './Connection/Connection';
import type {CryptoApi} from '@refinio/one.core/lib/crypto/CryptoApi';
import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {ensurePublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import {getLocalInstanceOfPerson} from './instance';
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
    isInternetOfMe: boolean;
    isCatchAll: boolean;

    localPublicKey: HexString;
    localInstanceId: SHA256IdHash<Instance>;
    localPersonId: SHA256IdHash<Person>;

    remotePublicKey: HexString;
    remoteInstanceId: SHA256IdHash<Instance>;
    remotePersonId: SHA256IdHash<Person>;

    enabled: boolean;
    enable: (enable: boolean) => Promise<void>;

    routes: {
        name: string;
        active: boolean;
        enabled: boolean;
        enable: (enable: boolean) => Promise<void>;
    }[];
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

export type CommunicationModuleConfiguration = {
    // The configuration for incoming connections
    // Default: An empty list => do not accept any incoming connections
    incomingConnectionConfigurations: IncomingConnectionConfiguration[];

    // The configuration for outgoing connections
    // Default: No outgoing connections
    outgoingRoutesGroupIds: string[];

    // The configuration for incoming connections
    // Default: No incoming connections
    incomingRoutesGroupIds: string[];

    // The reconnect delay for outgoing connections
    reconnectDelay: number;
};

type PeerId = string & {
    _: 'OneInstanceEndpointId';
};

function createPeerId(localPublicKey: PublicKey, remotePublicKey: PublicKey): PeerId {
    return `localKey: ${castToLocalPublicKey(localPublicKey)}, remoteKey: ${castToRemotePublicKey(
        remotePublicKey
    )}` as PeerId;
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
            localPersonId: SHA256IdHash<Person>,
            localInstanceId: SHA256IdHash<Instance>,
            remotePersonId: SHA256IdHash<Person>,
            remoteInstanceId: SHA256IdHash<Instance>,
            initiatedLocally: boolean,
            routeGropuId: string
        ) => void
    >();

    /**
     * Event that is emitted if an incoming connection was accepted and the identity of the other side is known
     */
    public onKnownConnection = new OEvent<
        (
            conn: Connection,
            localPersonId: SHA256IdHash<Person>,
            localInstanceId: SHA256IdHash<Instance>,
            remotePersonId: SHA256IdHash<Person>,
            remoteInstanceId: SHA256IdHash<Instance>,
            initiatedLocally: boolean,
            routeGropuId: string
        ) => void
    >();

    private initialized: boolean; // Flag that stores whether this module is initialized
    private readonly config: CommunicationModuleConfiguration;
    private readonly leuteModel: LeuteModel; // Contact model for getting contact objects
    private readonly connectionRouteManager: ConnectionRouteManager; // Manager for incoming

    // Internal maps and lists (dynamic)
    private readonly knownPeerMap: Map<PeerId, OneInstanceEndpoint>;
    private readonly myPublicKeyToInstanceInfoMap: Map<LocalPublicKey, LocalInstanceInfo>; // A map
    // from my public instance key to my id - used to map the public key of the new connection to my ids
    private readonly myIdentities: Set<SHA256IdHash<Person>>; // sync version of
    // this.leute.identities() so that connectionsInfo method doesn't have to be async.

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
            outgoingRoutesGroupIds:
                config.outgoingRoutesGroupIds !== undefined ? config.outgoingRoutesGroupIds : [],
            incomingRoutesGroupIds:
                config.incomingRoutesGroupIds !== undefined ? config.incomingRoutesGroupIds : [],
            reconnectDelay: config.reconnectDelay !== undefined ? config.reconnectDelay : 5000
        };

        this.leuteModel = leuteModel;
        this.connectionRouteManager = new ConnectionRouteManager(this.config.reconnectDelay);

        this.knownPeerMap = new Map();
        this.myPublicKeyToInstanceInfoMap = new Map();
        this.myIdentities = new Set();

        this.initialized = false;

        // Setup route manager events
        this.connectionRouteManager.onConnection(this.acceptConnection.bind(this));
        this.connectionRouteManager.onConnectionViaCatchAll(
            this.acceptConnectionViaCatchAll.bind(this)
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

        // This line is only there to enable the catch all routes, because we don't have a
        // enableCatchAllRoutes at the moment. We should fix this when we have a better
        // understanding of the catchAll stuff
        await this.connectionRouteManager.enableRoutes();
    }

    /**
     * Shutdown process
     */
    async shutdown(): Promise<void> {
        this.initialized = false;
        await this.connectionRouteManager.disableRoutes();

        // Clear all other fields
        this.knownPeerMap.clear();
        this.myPublicKeyToInstanceInfoMap.clear();
        this.myIdentities.clear();
    }

    /**
     * Return information about all known connections.
     *
     * @returns
     */
    public connectionsInfo(): ConnectionInfo[] {
        const info = this.connectionRouteManager.connectionRoutesInformation();

        const connectionsInfo: ConnectionInfo[] = [];
        for (const routeGroup of info.connectionsRoutesGroups) {
            const peerInfo = this.knownPeerMap.get(
                createPeerId(routeGroup.localPublicKey, routeGroup.remotePublicKey)
            );
            const myInfo = this.myPublicKeyToInstanceInfoMap.get(
                castToLocalPublicKey(routeGroup.localPublicKey)
            );
            const dummyInstanceId = '0'.repeat(64) as SHA256IdHash<Instance>;
            const dummyPersonId = '0'.repeat(64) as SHA256IdHash<Person>;

            connectionsInfo.push({
                isConnected: routeGroup.activeConnection !== null,
                isInternetOfMe: peerInfo ? this.myIdentities.has(peerInfo.personId) : false,
                isCatchAll: routeGroup.isCatchAllGroup,

                localPublicKey: castToLocalPublicKey(routeGroup.localPublicKey),
                localInstanceId: myInfo ? myInfo.instanceId : dummyInstanceId,
                localPersonId: myInfo ? myInfo.personId : dummyPersonId,

                remotePublicKey: castToRemotePublicKey(routeGroup.remotePublicKey),
                remoteInstanceId: peerInfo ? peerInfo.instanceId : dummyInstanceId,
                remotePersonId: peerInfo ? peerInfo.personId : dummyPersonId,

                enabled: routeGroup.knownRoutes.some(route => !route.disabled),
                enable: (enable: boolean): Promise<void> => {
                    if (enable) {
                        return this.connectionRouteManager.enableRoutes(
                            routeGroup.localPublicKey,
                            routeGroup.remotePublicKey,
                            routeGroup.groupName
                        );
                    } else {
                        return this.connectionRouteManager.disableRoutes(
                            routeGroup.localPublicKey,
                            routeGroup.remotePublicKey,
                            routeGroup.groupName
                        );
                    }
                },

                routes: routeGroup.knownRoutes.map(route => ({
                    name: route.route.id,
                    active: route.route.id === routeGroup.activeConnectionRoute?.id,
                    enabled: !route.disabled,
                    enable: (enable: boolean): Promise<void> => {
                        if (enable) {
                            return this.connectionRouteManager.enableRoutes(
                                routeGroup.localPublicKey,
                                routeGroup.remotePublicKey,
                                routeGroup.groupName,
                                route.route.id
                            );
                        } else {
                            return this.connectionRouteManager.disableRoutes(
                                routeGroup.localPublicKey,
                                routeGroup.remotePublicKey,
                                routeGroup.groupName,
                                route.route.id
                            );
                        }
                    }
                }))
            });
        }

        return connectionsInfo;
    }

    /**
     * Dumps all information about connections and routes in readable form to console.
     */
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

        // Setup incoming catch all routes
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

    /**
     *
     * @param remoteInstanceEndpoint
     * @private
     */
    private async setupRoutesForOneInstanceEndpoint(remoteInstanceEndpoint: OneInstanceEndpoint) {
        const remoteInstanceKeys = await getObject(remoteInstanceEndpoint.instanceKeys);
        const remoteInstanceKey = ensurePublicKey(hexToUint8Array(remoteInstanceKeys.publicKey));

        // Create an outgoing connection for all of my identities
        for (const myInfo of this.myPublicKeyToInstanceInfoMap.values()) {
            const peerId = createPeerId(
                myInfo.instanceCryptoApi.publicEncryptionKey,
                remoteInstanceKey
            );

            // Setup outgoing routes
            if (remoteInstanceEndpoint.url !== undefined) {
                for (const outgoingRoutesGroupId of this.config.outgoingRoutesGroupIds) {
                    const route = this.connectionRouteManager.addOutgoingWebsocketRoute(
                        myInfo.instanceCryptoApi.createEncryptionApiWithKeysAndPerson(
                            remoteInstanceKey
                        ),
                        remoteInstanceEndpoint.url,
                        outgoingRoutesGroupId
                    );

                    if (route.isNew) {
                        await this.connectionRouteManager.enableRoutes(
                            myInfo.instanceCryptoApi.publicEncryptionKey,
                            remoteInstanceKey,
                            outgoingRoutesGroupId,
                            route.id
                        );
                    }
                }
            }

            // Setup incoming routes
            for (const incomingRoutesGroupId of this.config.incomingRoutesGroupIds) {
                for (const config of this.config.incomingConnectionConfigurations) {
                    if (config.type === 'commserver') {
                        const route =
                            this.connectionRouteManager.addIncomingWebsocketRoute_CommServer(
                                myInfo.instanceCryptoApi,
                                remoteInstanceKey,
                                config.url,
                                incomingRoutesGroupId
                            );

                        if (route.isNew) {
                            await this.connectionRouteManager.enableRoutes(
                                myInfo.instanceCryptoApi.publicEncryptionKey,
                                remoteInstanceKey,
                                incomingRoutesGroupId,
                                route.id
                            );
                        }
                    } else if (config.type === 'socket') {
                        const route = this.connectionRouteManager.addIncomingWebsocketRoute_Direct(
                            myInfo.instanceCryptoApi,
                            remoteInstanceKey,
                            config.host,
                            config.port,
                            incomingRoutesGroupId
                        );

                        if (route.isNew) {
                            await this.connectionRouteManager.enableRoutes(
                                myInfo.instanceCryptoApi.publicEncryptionKey,
                                remoteInstanceKey,
                                incomingRoutesGroupId,
                                route.id
                            );
                        }
                    }
                }
            }

            this.knownPeerMap.set(peerId, remoteInstanceEndpoint);
        }
    }

    /**
     * Get all instance endpoints that don't represent this instance.
     */
    private async fetchOtherOneInstanceEndpointsFromLeute(): Promise<
        {instanceEndpoint: OneInstanceEndpoint; isIom: boolean}[]
    > {
        // My non local instanceEndpoints
        const myEndpoints = (await this.leuteModel.getInternetOfMeEndpoints()).map(
            instanceEndpoint => {
                return {
                    instanceEndpoint,
                    isIom: true
                };
            }
        );

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

        await Promise.all(
            meSomeone.identities().map(async identity => {
                if (await isPersonComplete(identity)) {
                    const instanceId = await getLocalInstanceOfPerson(identity);
                    const keysHash = await getDefaultKeys(instanceId);
                    const keys = await getObject(keysHash);

                    this.myPublicKeyToInstanceInfoMap.set(keys.publicKey as LocalPublicKey, {
                        instanceId,
                        instanceCryptoApi: await createCryptoApiFromDefaultKeys(instanceId),
                        personId: identity
                    });
                }
                this.myIdentities.add(identity);
            })
        );
    }

    // ######## Event handlers ########

    /**
     * Accept a new connection.
     *
     * This is used for incoming as well as outgoing connections.
     *
     * @param conn - The encrypted connection that was accepted.
     * @param localPublicKey - The public key of the local instance
     * @param remotePublicKey - The public key of the remote peer
     * @param connectionRoutesGroupName
     * @param initiatedLocally
     */
    private async acceptConnection(
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRoutesGroupName: string,
        initiatedLocally: boolean
    ): Promise<void> {
        const peerId = createPeerId(localPublicKey, remotePublicKey);

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

        MessageBus.send('log', `${conn.id}: acceptConnection: verifyAndExchangePersonId`);

        const personInfo = await verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            myInfo.personId,
            initiatedLocally,
            oneInstanceEndpoint.personId
        );

        MessageBus.send('log', `${conn.id}: acceptConnection: exchangeInstanceIdObjects`);

        const instanceInfo = await exchangeInstanceIdObjects(conn, myInfo.instanceId);

        if (oneInstanceEndpoint.instanceId !== instanceInfo.remoteInstanceId) {
            throw new Error(
                'The instance id we have on record for your specified public key does not match' +
                    ' the instance id that you sent us.'
            );
        }

        // Exchange these things:
        // - Instance keys [already and verified by lower levels]
        // - Person keys
        // - Person Id(Obj)
        // - Instance Id(Obj)

        // ---- Before this ----
        // receive instance key
        // -> challenge the key
        // ---- This ----
        // receive instance id (hint)
        // -> lookup key in instance entries
        // receive person key
        // -> challenge the key
        // receive person id (this is a hint to faster find the key)
        // -> lookup the key in the persons entries

        this.onKnownConnection.emit(
            conn,
            myInfo.personId,
            myInfo.instanceId,
            oneInstanceEndpoint.personId,
            oneInstanceEndpoint.instanceId,
            initiatedLocally,
            connectionRoutesGroupName
        );
    }

    /**
     *
     * @param conn
     * @param localPublicKey
     * @param remotePublicKey
     * @param connectionRoutesGroupName
     * @param initiatedLocally
     * @private
     */
    private async acceptConnectionViaCatchAll(
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRoutesGroupName: string,
        initiatedLocally: boolean
    ): Promise<void> {
        const peerId = createPeerId(localPublicKey, remotePublicKey);

        const oneInstanceEndpoint = this.knownPeerMap.get(peerId);

        const myInfo = this.myPublicKeyToInstanceInfoMap.get(castToLocalPublicKey(localPublicKey));
        if (myInfo === undefined) {
            conn.close('Could not find the person that you want to communicate with.');
            return;
        }

        const personInfo = await verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            myInfo.personId,
            initiatedLocally,
            oneInstanceEndpoint?.personId
        );

        const instanceInfo = await exchangeInstanceIdObjects(conn, myInfo.instanceId);

        if (oneInstanceEndpoint !== undefined) {
            if (oneInstanceEndpoint.instanceId !== instanceInfo.remoteInstanceId) {
                throw new Error(
                    'The instance id we have on record for your specified public key does not match' +
                        ' the instance id that you sent us.'
                );
            }

            this.onKnownConnection.emit(
                conn,
                myInfo.personId,
                myInfo.instanceId,
                oneInstanceEndpoint.personId,
                oneInstanceEndpoint.instanceId,
                initiatedLocally,
                connectionRoutesGroupName
            );
        } else {
            this.onUnknownConnection.emit(
                conn,
                myInfo.personId,
                myInfo.instanceId,
                personInfo.personId,
                instanceInfo.remoteInstanceId,
                initiatedLocally,
                connectionRoutesGroupName
            );
        }

        /*this.onUnknownConnection.emit(
            conn,
            localPublicKey,
            remotePublicKey,
            myInfo.personId,
            initiatedLocally,
            connectionGroupName
        );*/
    }
}
