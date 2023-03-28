import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {Instance} from '@refinio/one.core/lib/recipes';
import {startChumProtocol} from '../misc/ConnectionEstablishment/protocols/Chum';
import type {Protocols} from '../misc/ConnectionEstablishment/protocols/CommunicationInitiationProtocolMessages';
import type {
    ConnectionInfo,
    ConnectionInfoId
} from '../misc/ConnectionEstablishment/LeuteConnectionsModule';
import LeuteConnectionsModule from '../misc/ConnectionEstablishment/LeuteConnectionsModule';
import {OEvent} from '../misc/OEvent';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import type LeuteModel from './Leute/LeuteModel';
import {Model} from './Model';
import type Connection from '../misc/Connection/Connection';
import PairingManager from '../misc/ConnectionEstablishment/PairingManager';

const MessageBus = createMessageBus('ConnectionsModel');

/**
 * Configuration parameters for the ConnectionsModel
 *
 * TODO: Most of the config values will come from the local instance config
 *       So each instance can decide how it can be reached.
 */
export type ConnectionsModelConfiguration = {
    // #### Incoming connections ####

    // The comm server to use for incoming connections.
    // Default: ws://localhost:8000
    commServerUrl: string;

    // If true accept incoming connections. If not do only outgoing
    // Default: true
    acceptIncomingConnections: boolean;

    // #### Incoming connections - chum workflow settings (incoming) ####

    // If true accept unknown instances of known persons (incoming connections)
    // Default: false
    acceptUnknownInstances: boolean;

    // If true accept unknown instances and unknown persons (incoming connections)
    // Default: false
    acceptUnknownPersons: boolean;

    // #### Incoming connections - One time auth workflow settings (incoming) ####

    // If true allow one time authentication workflows (incoming connections)
    // Default: true
    allowPairing: boolean;

    // The amount of time an authentication token is valid (incoming connections)
    // Default: 60000 (1 minute)
    pairingTokenExpirationDuration: number;

    // #### Outgoing connection configuration ####
    // If true automatically establish outgoing connections
    // Default: true
    establishOutgoingConnections: boolean;
};

/**
 * This model manages all connections including pairing scenarios etc.
 *
 * The lower levels handle the complete connection establishment based on information found in
 * Leute. This module just executes the correct protocol when a connection was established (e.g.
 * the chum, or the pairing protocol ...)
 *
 * Pairing:
 * Pairing is handled by the PairingManager that can be accessed by ".pairing" on this module.
 */
class ConnectionsModel extends Model {
    /**
     * Event is emitted when state of the connector changes. The emitted value represents the updated state.
     */
    public onOnlineStateChange = new OEvent<(state: boolean) => void>();

    /**
     * Event is emitted when a connection is established or closed.
     */
    public onConnectionsChange = new OEvent<() => void>();

    /**
     * Event is emitted when the chum starts.
     */
    public onProtocolStart = new OEvent<
        (
            initiatedLocally: boolean,
            localPersonId: SHA256IdHash<Person>,
            localInstanceId: SHA256IdHash<Instance>,
            remotePersonId: SHA256IdHash<Person>,
            remoteInstanceId: SHA256IdHash<Instance>,
            protocol: Protocols
        ) => void
    >();

    public readonly pairing: PairingManager;

    private readonly config: ConnectionsModelConfiguration;
    private readonly leuteConnectionsModule: LeuteConnectionsModule;
    private readonly leuteModel: LeuteModel;

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns
     */
    public get onlineState(): boolean {
        return this.leuteConnectionsModule.onlineState;
    }

    /**
     * Construct a new instance
     *
     * @param leuteModel
     * @param config
     */
    constructor(leuteModel: LeuteModel, config: Partial<ConnectionsModelConfiguration>) {
        super();
        // Build configuration object by using default values
        this.config = {
            commServerUrl:
                config.commServerUrl === undefined ? 'ws://localhost:8000' : config.commServerUrl,
            acceptIncomingConnections:
                config.acceptIncomingConnections === undefined
                    ? true
                    : config.acceptIncomingConnections,
            acceptUnknownInstances:
                config.acceptUnknownInstances === undefined ? false : config.acceptUnknownInstances,
            acceptUnknownPersons:
                config.acceptUnknownPersons === undefined ? false : config.acceptUnknownPersons,
            allowPairing: config.allowPairing === undefined ? true : config.allowPairing,
            pairingTokenExpirationDuration:
                config.pairingTokenExpirationDuration === undefined
                    ? 60000
                    : config.pairingTokenExpirationDuration,
            establishOutgoingConnections:
                config.establishOutgoingConnections === undefined
                    ? true
                    : config.establishOutgoingConnections
        };

        // Setup / init modules
        this.leuteModel = leuteModel;

        const catchAll =
            this.config.allowPairing ||
            this.config.acceptUnknownInstances ||
            this.config.acceptUnknownPersons;
        this.leuteConnectionsModule = new LeuteConnectionsModule(leuteModel, {
            incomingConnectionConfigurations: this.config.acceptIncomingConnections
                ? [{type: 'commserver', url: this.config.commServerUrl, catchAll}]
                : [],
            incomingRoutesGroupIds: ['chum'],
            outgoingRoutesGroupIds: this.config.establishOutgoingConnections ? ['chum'] : [],
            reconnectDelay: 5000
        });
        this.leuteConnectionsModule.onKnownConnection(this.onKnownConnection.bind(this));
        this.leuteConnectionsModule.onUnknownConnection(this.onUnknownConnection.bind(this));
        this.leuteConnectionsModule.onOnlineStateChange(state => {
            this.onOnlineStateChange.emit(state);
        });
        this.leuteConnectionsModule.onConnectionsChange(() => {
            this.onConnectionsChange.emit();
        });

        this.pairing = new PairingManager(
            this.leuteModel,
            this.config.pairingTokenExpirationDuration,
            this.config.commServerUrl
        );
    }

    /**
     * Initialize this module.
     */
    async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');
        await this.leuteConnectionsModule.init();
        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        await this.leuteConnectionsModule.shutdown();
        this.pairing.invalidateAllInvitations();
        this.state.triggerEvent('shutdown');
    }

    /**
     * Enable all connections to this person.
     *
     * @param remotePersonId
     * @param localPersonId - If specified only the connections originating from this person are
     * affected.
     */
    async enableConnectionsToPerson(
        remotePersonId: SHA256IdHash<Person>,
        localPersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        await this.leuteConnectionsModule.enableConnectionsToPerson(remotePersonId, localPersonId);
    }

    /**
     * Disable all connections to this person.
     *
     * @param remotePersonId
     * @param localPersonId - If specified only the connections originating from this person are
     * affected.
     */
    async disableConnectionsToPerson(
        remotePersonId: SHA256IdHash<Person>,
        localPersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        await this.leuteConnectionsModule.disableConnectionsToPerson(remotePersonId, localPersonId);
    }

    /**
     * Enable all connections to this instance.
     *
     * @param remoteInstanceId
     * @param localPersonId - If specified only the connections originating from this person are
     * affected.
     */
    async enableConnectionsToInstance(
        remoteInstanceId: SHA256IdHash<Instance>,
        localPersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        await this.leuteConnectionsModule.enableConnectionsToInstance(
            remoteInstanceId,
            localPersonId
        );
    }

    /**
     * Disable all connections to this instance.
     *
     * @param remoteInstanceId
     * @param localPersonId - If specified only the connections originating from this person are
     * affected.
     */
    async disableConnectionsToInstance(
        remoteInstanceId: SHA256IdHash<Instance>,
        localPersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        await this.leuteConnectionsModule.disableConnectionsToInstance(
            remoteInstanceId,
            localPersonId
        );
    }

    /**
     * Returns information about all connections and routes.
     */
    connectionsInfo(filterConnectionInfos?: ConnectionInfoId): ConnectionInfo[] {
        return this.leuteConnectionsModule.connectionsInfo(filterConnectionInfos);
    }

    /**
     * Dumps all information about connections and routes in readable form to console.
     */
    debugDump(header: string = ''): void {
        this.leuteConnectionsModule.debugDump(header);
    }

    // ######## PAIRING ########

    /**
     * This function is called whenever a connection with a known instance was established
     *
     * @param conn
     * @param localPersonId
     * @param localInstanceId
     * @param remotePersonId
     * @param remoteInstanceId
     * @param initiatedLocally
     * @param connectionRoutesGroupName
     */
    private async onKnownConnection(
        conn: Connection,
        localPersonId: SHA256IdHash<Person>,
        localInstanceId: SHA256IdHash<Instance>,
        remotePersonId: SHA256IdHash<Person>,
        remoteInstanceId: SHA256IdHash<Instance>,
        initiatedLocally: boolean,
        connectionRoutesGroupName: string
    ): Promise<void> {
        MessageBus.send('log', `${conn.id}: onKnownConnection()`);

        try {
            if (connectionRoutesGroupName === 'chum') {
                await startChumProtocol(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId,
                    initiatedLocally,
                    connectionRoutesGroupName,
                    this.onProtocolStart
                );
            } else if (connectionRoutesGroupName === 'pairing') {
                await this.pairing.acceptInvitation(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId
                );
            } else {
                throw new Error(
                    `ConnectionRoutesGroupName ${connectionRoutesGroupName} not supported`
                );
            }
        } catch (e) {
            MessageBus.send('log', `${conn.id}: onKnownConnection: Error in protocol ${e}`);
            conn.close(e.toString());
            return;
        }
    }

    /**
     * This function is called whenever a connection with an unknown instance was established
     *
     * @param conn
     * @param localPersonId
     * @param localInstanceId
     * @param remotePersonId
     * @param remoteInstanceId
     * @param initiatedLocally
     * @param connectionRoutesGroupName
     */
    private async onUnknownConnection(
        conn: Connection,
        localPersonId: SHA256IdHash<Person>,
        localInstanceId: SHA256IdHash<Instance>,
        remotePersonId: SHA256IdHash<Person>,
        remoteInstanceId: SHA256IdHash<Instance>,
        initiatedLocally: boolean,
        connectionRoutesGroupName: string
    ): Promise<void> {
        MessageBus.send('log', `${conn.id}: onUnknownConnection()`);

        try {
            // On outgoing connections we try to use the chum protocol
            if (initiatedLocally) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('Locally initiated connections should never be unknown.');
            }

            if (connectionRoutesGroupName === 'chum') {
                if (!this.config.acceptUnknownPersons) {
                    throw new Error('Unable to start chum because you are unknown');
                }

                await startChumProtocol(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId,
                    initiatedLocally,
                    connectionRoutesGroupName,
                    this.onProtocolStart
                );
            } else if (connectionRoutesGroupName === 'pairing') {
                await this.pairing.acceptInvitation(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId
                );
            } else {
                throw new Error(
                    `ConnectionRoutesGroupName ${connectionRoutesGroupName} not supported`
                );
            }
        } catch (e) {
            MessageBus.send('log', `${conn.id}: onUnknownConnection: Error in protocol ${e}`);
            conn.close(e.toString());
            return;
        }
    }
}

export default ConnectionsModel;
