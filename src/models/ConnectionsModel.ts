import type {Instance} from '@refinio/one.core/lib/recipes';
import {startChum} from '../misc/ConnectionEstablishment/protocols/ChumStart';
import {
    sendPeerMessage,
    waitForPeerMessage
} from '../misc/ConnectionEstablishment/protocols/CommunicationInitiationProtocolMessages';
import type {Protocols} from '../misc/ConnectionEstablishment/protocols/CommunicationInitiationProtocolMessages';
import type {ConnectionInfo} from '../misc/LeuteConnectionsModule';
import LeuteConnectionsModule from '../misc/LeuteConnectionsModule';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {OEvent} from '../misc/OEvent';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import type LeuteModel from './Leute/LeuteModel';
import {Model} from './Model';
import type Connection from '../misc/Connection/Connection';
import PairingManager from './PairingManager';

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
    allowOneTimeAuth: boolean;

    // The amount of time an authentication token is valid (incoming connections)
    // Default: 60000 (1 minute)
    pairingTokenExpirationDuration: number;

    // If true, then the allowSerAuthGroup call is enabled
    allowSetAuthGroup: boolean;

    // #### Outgoing connection configuration ####
    // If true automatically establish outgoing connections
    // Default: true
    establishOutgoingConnections: boolean;
};

/**
 * This model manages all connections including pairing scenarios etc.
 *
 * Keeping connections established to other instances is mostly deferred to the CommunicationModule. So have a look
 * at this class to see how connections are established.
 *
 * So the implementation of this module mostly focuses on two things:
 * 1) For known connections setup chums for data exchange
 * 2) Pair unknown connections/instances so that they become known connections
 *
 * This class will provide multiple pairing mechanisms in the future. Currently only one is supported and it works
 * like this
 * - Pairing information is generated (contains a random authentication tag) that expires in a certain amount of time
 * - If an unknown connection arrives, that carries one of the non-expired pairing information, then a chum is set up
 * - The chum is then used to exchange contact information
 *   => the next connection attempt will then be a known connection, so pairing is done
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

    public readonly pairing;

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
            allowOneTimeAuth:
                config.allowOneTimeAuth === undefined ? true : config.allowOneTimeAuth,
            pairingTokenExpirationDuration:
                config.pairingTokenExpirationDuration === undefined
                    ? 60000
                    : config.pairingTokenExpirationDuration,
            allowSetAuthGroup:
                config.allowSetAuthGroup === undefined ? false : config.allowSetAuthGroup,
            establishOutgoingConnections:
                config.establishOutgoingConnections === undefined
                    ? true
                    : config.establishOutgoingConnections
        };

        // Setup / init modules
        this.leuteModel = leuteModel;

        this.leuteConnectionsModule = new LeuteConnectionsModule(leuteModel, {
            incomingConnectionConfigurations: [
                {type: 'commserver', url: this.config.commServerUrl}
            ],
            incomingRoutesGroupIds: ['chum'],
            outgoingRoutesGroupIds: ['chum'],
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
    public async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');
        await this.leuteConnectionsModule.init();
        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        await this.leuteConnectionsModule.shutdown();
        this.pairing.invalidateAllInvitations();
        this.state.triggerEvent('shutdown');
    }

    /**
     *
     * @returns
     */
    public connectionsInfo(): ConnectionInfo[] {
        this.state.assertCurrentState('Initialised');

        return this.leuteConnectionsModule.connectionsInfo();
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
                // On outgoing connections we use the chum protocol
                if (initiatedLocally) {
                    sendPeerMessage(conn, {
                        command: 'start_protocol',
                        protocol: 'chum',
                        version: '1.0'
                    });

                    this.onProtocolStart.emit(
                        initiatedLocally,
                        localPersonId,
                        localInstanceId,
                        remotePersonId,
                        remoteInstanceId,
                        'chum'
                    );

                    await startChum(
                        conn,
                        localPersonId,
                        localInstanceId,
                        remotePersonId,
                        remoteInstanceId,
                        connectionRoutesGroupName,
                        true
                    );
                }

                // On incoming connections we wait for the peer to select its protocol
                else {
                    const protocolMsg = await waitForPeerMessage(conn, 'start_protocol');
                    MessageBus.send(
                        'log',
                        `${conn.id}: Known: Start protocol ${protocolMsg.protocol} ${protocolMsg.version}`
                    );

                    // The normal chum protocol
                    if (protocolMsg.protocol === 'chum') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum protocol version.');
                    }

                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum protocol version.');
                    }

                    this.onProtocolStart.emit(
                        initiatedLocally,
                        localPersonId,
                        localInstanceId,
                        remotePersonId,
                        remoteInstanceId,
                        'chum'
                    );

                    await startChum(
                        conn,
                        localPersonId,
                        localInstanceId,
                        remotePersonId,
                        remoteInstanceId,
                        connectionRoutesGroupName,
                        true
                    );
                }
            } else if (connectionRoutesGroupName === 'pairing') {
                const protocolMsg = await waitForPeerMessage(conn, 'start_protocol');
                MessageBus.send(
                    'log',
                    `${conn.id}: Unknown: Start protocol ${protocolMsg.protocol} ${protocolMsg.version}`
                );

                if (protocolMsg.protocol !== 'pairing') {
                    throw new Error(
                        `Unexpected protocol ${protocolMsg.protocol}. Expected pairing protocol.`
                    );
                }

                if (protocolMsg.version !== '1.0') {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(`Unsupported pairing protocol version ${protocolMsg.version}`);
                }

                await this.pairing.acceptInvitation(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId
                );
            } else {
                throw new Error(`RoutesGroupName ${connectionRoutesGroupName} not supported`);
            }
        } catch (e) {
            MessageBus.send('log', `${conn.id}: Known: Error in protocol ${e}`);
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
                throw new Error('Unable to start chum because you are unknown');
            } else if (connectionRoutesGroupName === 'pairing') {
                const protocolMsg = await waitForPeerMessage(conn, 'start_protocol');
                MessageBus.send(
                    'log',
                    `${conn.id}: Unknown: Start protocol ${protocolMsg.protocol} ${protocolMsg.version}`
                );

                if (protocolMsg.protocol !== 'pairing') {
                    throw new Error(
                        `Unexpected protocol ${protocolMsg.protocol}. Expected pairing protocol.`
                    );
                }

                if (protocolMsg.version !== '1.0') {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(`Unsupported pairing protocol version ${protocolMsg.version}`);
                }

                await this.pairing.acceptInvitation(
                    conn,
                    localPersonId,
                    localInstanceId,
                    remotePersonId,
                    remoteInstanceId
                );
            } else {
                throw new Error(`RoutesGroupName ${connectionRoutesGroupName} not supported`);
            }
        } catch (e) {
            MessageBus.send('log', `${conn.id}: Unknown: Error in protocol ${e}`);
            conn.close(e.toString());
            return;
        }
    }
}

export default ConnectionsModel;
