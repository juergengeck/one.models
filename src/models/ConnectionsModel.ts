import type {ConnectionInfo} from '../misc/CommunicationModule';
import CommunicationModule from '../misc/CommunicationModule';
import {createWebsocketPromisifier} from '@refinio/one.core/lib/websocket-promisifier';
import {
    createSingleObjectThroughPurePlan,
    getIdObject,
    getObject,
    VERSION_UPDATES
} from '@refinio/one.core/lib/storage';
import {wait} from '@refinio/one.core/lib/util/promise';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import tweetnacl from 'tweetnacl';
import type CommunicationInitiationProtocol from '../misc/CommunicationInitiationProtocol';
import {isPeerMessage} from '../misc/CommunicationInitiationProtocol';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {OEvent} from '../misc/OEvent';
import {countEnumerableProperties, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Keys, Person} from '@refinio/one.core/lib/recipes';
import type LeuteModel from './Leute/LeuteModel';
import {Model} from './Model';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {
    hexToUint8Array,
    isHexString,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {connectWithEncryption} from '../misc/Connections/protocols/ConnectionSetup';
import type Connection from '../misc/Connections/Connection';
import {
    convertIdentityToProfile,
    convertOneInstanceEndpointToIdentity
} from '../misc/IdentityExchange';
import {createChum} from '@refinio/one.core/lib/chum-sync';
import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {ensurePublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import type {CryptoApi} from '@refinio/one.core/lib/crypto/CryptoApi';
import {isObject, isString} from '@refinio/one.core/lib/util/type-checks-basic';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';

const MessageBus = createMessageBus('ConnectionsModel');

/**
 * Additional information for instance takeover.
 */
export type TakeOverInformation = {
    nonce: HexString;
    email: string;
};

/**
 * Checks if the given parameter is a `TakeOverInformation` object
 * @param thing
 * @returns {boolean}
 */
export function isTakeOverInformation(thing: unknown): thing is TakeOverInformation {
    return (
        isObject(thing) &&
        isHexString(thing.nonce) &&
        isString(thing.email) &&
        countEnumerableProperties(thing) === 2
    );
}

/**
 * This is the information that needs to pe transmitted securely to the device that shall be paired
 *
 * TODO: the content should be cleaned up.
 */
export type PairingInformation = {
    authenticationTag: string;
    publicKeyLocal: HexString;
    url: string;
    takeOver: boolean;
    takeOverDetails?: TakeOverInformation;
};

/**
 * Checks if the given parameter is a `PairingInformation` object
 * @param thing
 * @returns {boolean}
 */
export function isPairingInformation(thing: unknown): thing is PairingInformation {
    return (
        isObject(thing) &&
        isString(thing.authenticationTag) &&
        isHexString(thing.publicKeyLocal) &&
        typeof thing.takeOver === 'boolean' &&
        (thing.takeOverDetails === undefined || isTakeOverInformation(thing.takeOverDetails)) &&
        (countEnumerableProperties(thing) === 4 || countEnumerableProperties(thing) === 5)
    );
}

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
    authTokenExpirationDuration: number;

    // If true, then the allowSerAuthGroup call is enabled
    allowSetAuthGroup: boolean;

    // #### Outgoing connection configuration ####
    // If true automatically establish outgoing connections
    // Default: true
    establishOutgoingConnections: boolean;
};

/**
 * This type holds the data associated with an authentication token for pairing
 */
type AuthenticationTokenInfo = {
    token: string;
    localPersonId: SHA256IdHash<Person>;
    expirationTimeoutHandle: ReturnType<typeof setTimeout>;
};

/**
 * This type holds the data associated with an authentication token for instance takeover
 */
type PkAuthenticationTokenInfo = {
    token: string;
    localPersonId: SHA256IdHash<Person>;
    salt: Uint8Array;
    expirationTimeoutHandle: ReturnType<typeof setTimeout>;
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
     * Event is emitted when the one time authentication was successful. The emitted event value represents the
     * authentication token.
     */
    public onOneTimeAuthSuccess = new OEvent<
        (
            token: string,
            flag: boolean,
            localPersonId: SHA256IdHash<Person>,
            personId: SHA256IdHash<Person>
        ) => void
    >();
    /**
     * Event is emitted when the chum starts.
     */
    public onChumStart = new OEvent<
        (
            localPersonId: SHA256IdHash<Person>,
            remotePersonId: SHA256IdHash<Person>,
            protocol: CommunicationInitiationProtocol.Protocols,
            initiatedLocally: boolean,
            keepRunning: boolean
        ) => void
    >();

    public onOneTimeAuthSuccessFirstSync = new OEvent<
        (
            token: string,
            flag: boolean,
            localPersonId: SHA256IdHash<Person>,
            personId: SHA256IdHash<Person>
        ) => void
    >();

    // Models
    private communicationModule: CommunicationModule;
    private readonly leuteModel: LeuteModel;

    // Global settings
    private readonly config: ConnectionsModelConfiguration;

    // State variables
    private initialized: boolean; // Flag that stores whether this module is initialized

    // Other stuff
    private oneTimeAuthenticationTokens: Map<string, AuthenticationTokenInfo>;
    private pkOneTimeAuthenticationTokens: Map<string, PkAuthenticationTokenInfo>;

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns
     */
    public get onlineState(): boolean {
        return this.communicationModule.onlineState;
    }

    /**
     * Retrieve the authentication token expiration time.
     *
     * @returns
     */
    public get authTokenExpirationDuration(): number {
        return this.config.authTokenExpirationDuration;
    }

    /**
     * Set a new value to specify how long a created invite is valid.
     *
     * @param newExpirationDuration
     */
    public set authTokenExpirationDuration(newExpirationDuration: number) {
        this.config.authTokenExpirationDuration = newExpirationDuration;
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
                config.commServerUrl !== undefined ? config.commServerUrl : 'ws://localhost:8000',
            acceptIncomingConnections:
                config.acceptIncomingConnections !== undefined
                    ? config.acceptIncomingConnections
                    : true,
            acceptUnknownInstances:
                config.acceptUnknownInstances !== undefined ? config.acceptUnknownInstances : false,
            acceptUnknownPersons:
                config.acceptUnknownPersons !== undefined ? config.acceptUnknownPersons : false,
            allowOneTimeAuth:
                config.allowOneTimeAuth !== undefined ? config.allowOneTimeAuth : true,
            authTokenExpirationDuration:
                config.authTokenExpirationDuration !== undefined
                    ? config.authTokenExpirationDuration
                    : 60000,
            allowSetAuthGroup:
                config.allowSetAuthGroup !== undefined ? config.allowSetAuthGroup : false,
            establishOutgoingConnections:
                config.establishOutgoingConnections !== undefined
                    ? config.establishOutgoingConnections
                    : true
        };

        // Setup / init modules
        this.leuteModel = leuteModel;
        this.communicationModule = new CommunicationModule(
            this.config.commServerUrl,
            leuteModel,
            this.config.establishOutgoingConnections
        );
        this.communicationModule.onKnownConnection(this.onKnownConnection.bind(this));
        this.communicationModule.onUnknownConnection(this.onUnknownConnection.bind(this));
        this.communicationModule.onOnlineStateChange(state => {
            this.onOnlineStateChange.emit(state);
        });
        this.communicationModule.onConnectionsChange(() => {
            this.onConnectionsChange.emit();
        });

        // Changed by init
        this.initialized = false;
        this.oneTimeAuthenticationTokens = new Map<string, AuthenticationTokenInfo>();
        this.pkOneTimeAuthenticationTokens = new Map<string, PkAuthenticationTokenInfo>();
    }

    /**
     * Initialize this module.
     */
    public async init(): Promise<void> {
        this.state.assertCurrentState('Uninitialised');

        this.initialized = true;

        await this.communicationModule.init();

        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        this.initialized = false;
        await this.communicationModule.shutdown();

        for (const authTokenData of this.oneTimeAuthenticationTokens.values()) {
            clearTimeout(authTokenData.expirationTimeoutHandle);
        }
        this.oneTimeAuthenticationTokens.clear();

        for (const authTokenData of this.pkOneTimeAuthenticationTokens.values()) {
            clearTimeout(authTokenData.expirationTimeoutHandle);
        }
        this.pkOneTimeAuthenticationTokens.clear();

        this.state.triggerEvent('shutdown');
    }

    /**
     *
     * @returns
     */
    public connectionsInfo(): ConnectionInfo[] {
        this.state.assertCurrentState('Initialised');

        return this.communicationModule.connectionsInfo();
    }

    /**
     * Generates the information for sharing which will be sent in the QR code.
     *
     * @param takeOver
     * @param token supply a token instead generating a new one
     * @returns {Promise<PairingInformation>}
     */
    public async generatePairingInformation(
        takeOver: boolean,
        token?: string
    ): Promise<PairingInformation> {
        this.state.assertCurrentState('Initialised');

        if (!this.initialized) {
            throw new Error('Module is not initialized!');
        }

        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

        const authenticationToken = token ? token : await createRandomString();

        if (takeOver) {
            const myEmail = (await getIdObject(mainInstanceInfo.personId)).email;
            const salt = tweetnacl.randomBytes(64);

            // Set up the expiration of the token
            const expirationTimeoutHandle = setTimeout(
                () => this.pkOneTimeAuthenticationTokens.delete(authenticationToken),
                this.config.authTokenExpirationDuration
            );

            // Add the token to the list of valid tokens
            this.pkOneTimeAuthenticationTokens.set(authenticationToken, {
                token: authenticationToken,
                localPersonId: mainInstanceInfo.personId,
                salt: salt,
                expirationTimeoutHandle
            });

            // Build and return the pairing information that is transferred to the other instance e.g. by qr code
            return {
                authenticationTag: authenticationToken,
                publicKeyLocal: uint8arrayToHexString(
                    mainInstanceInfo.instanceKeys.publicEncryptionKey
                ),
                url: this.config.commServerUrl,
                takeOver: true,
                takeOverDetails: {
                    nonce: uint8arrayToHexString(salt),
                    email: myEmail
                }
            };
        } else {
            // Set up the expiration of the token
            const expirationTimeoutHandle = setTimeout(
                () => this.oneTimeAuthenticationTokens.delete(authenticationToken),
                this.config.authTokenExpirationDuration
            );

            // Add the token to the list of valid tokens
            this.oneTimeAuthenticationTokens.set(authenticationToken, {
                token: authenticationToken,
                localPersonId: mainInstanceInfo.personId,
                expirationTimeoutHandle
            });

            // Build and return the pairing information that is transferred to the other instance e.g. by qr code
            return {
                authenticationTag: authenticationToken,
                publicKeyLocal: uint8arrayToHexString(
                    mainInstanceInfo.instanceKeys.publicEncryptionKey
                ),
                url: this.config.commServerUrl,
                takeOver: false
            };
        }
    }

    /**
     * Connect to the target and transmit the setAccessGroup command
     *
     * @param remotePerson
     * @param accessGroupMembers
     */
    public async connectSettingAccessGroups(
        remotePerson: SHA256IdHash<Person>,
        accessGroupMembers: SHA256IdHash<Person>[]
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const endpoints = await this.leuteModel.findAllOneInstanceEndpointsForOthers();
        const remoteEndpoint = endpoints.find(
            endpoint => endpoint.personId === remotePerson && endpoint.personKeys
        );
        if (!remoteEndpoint) {
            throw new Error('Could not find pairing information.');
        }
        if (!remoteEndpoint.personKeys) {
            throw new Error('Endpoint does not have a person key.');
        }

        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();
        const remoteInstanceKey = ensurePublicKey(
            hexToUint8Array((await getObject(remoteEndpoint.instanceKeys)).publicKey)
        );

        // Connect to target
        const connInfo = await connectWithEncryption(
            remoteEndpoint.url,
            mainInstanceInfo.instanceKeys.publicEncryptionKey,
            remoteInstanceKey,
            text => {
                return mainInstanceInfo.cryptoApi.encryptAndEmbedNonce(text, remoteInstanceKey);
            },
            cypherText => {
                return mainInstanceInfo.cryptoApi.decryptWithEmbeddedNonce(
                    cypherText,
                    remoteInstanceKey
                );
            }
        );

        // Start the takeover protocol
        try {
            // Send the other side the protocol we'd like to use
            await ConnectionsModel.sendMessage(connInfo.connection, {
                command: 'start_protocol',
                protocol: 'accessGroup_set',
                version: '1.0'
            });

            // Start the selected protocol
            await this.startSetAccessGroup_Client(
                connInfo.connection,
                mainInstanceInfo.personId,
                remotePerson,
                accessGroupMembers
            );
        } catch (e) {
            connInfo.connection.close(e.message);
            throw e;
        }
    }

    /**
     * Connect to target using pairing information with the goal to pair / being taken over
     *
     * @param pairingInformation
     */
    public async connectUsingPairingInformation(
        pairingInformation: PairingInformation
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (!this.initialized) {
            throw new Error('Module is not initialized!');
        }

        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();
        const localPublicInstanceKey = mainInstanceInfo.instanceKeys.publicEncryptionKey;
        const remotePublicInstanceKey = ensurePublicKey(
            hexToUint8Array(pairingInformation.publicKeyLocal)
        );

        // Case of takeover
        if (pairingInformation.takeOver) {
            throw new Error('Takeover is not supported anymore!');
        }

        // Case for normal pairing
        else {
            // Connect to target
            const connInfo = await connectWithEncryption(
                this.config.commServerUrl,
                localPublicInstanceKey,
                remotePublicInstanceKey,
                text => {
                    if (!mainInstanceInfo) {
                        throw new Error('mainInstanceInfo not initialized.');
                    }
                    return mainInstanceInfo.cryptoApi.encryptAndEmbedNonce(
                        text,
                        remotePublicInstanceKey
                    );
                },
                cypherText => {
                    if (!mainInstanceInfo) {
                        throw new Error('mainInstanceInfo not initialized.');
                    }
                    return mainInstanceInfo.cryptoApi.decryptWithEmbeddedNonce(
                        cypherText,
                        remotePublicInstanceKey
                    );
                }
            );

            // Add this connection to the communication module, so that it becomes the known connection
            this.communicationModule.addNewUnknownConnection(
                localPublicInstanceKey,
                remotePublicInstanceKey,
                connInfo.connection
            );

            // Start the pairing protocol
            try {
                // Send the other side the protocol we'd like to use
                await ConnectionsModel.sendMessage(connInfo.connection, {
                    command: 'start_protocol',
                    protocol: 'pairing',
                    version: '1.0'
                });

                // Start the selected protocol
                await this.startPairingProtocol_Client(
                    connInfo.connection,
                    localPublicInstanceKey,
                    remotePublicInstanceKey,
                    mainInstanceInfo.personId,
                    pairingInformation.authenticationTag
                );
            } catch (e) {
                connInfo.connection.close(e.message);
                throw e;
            }
        }
    }

    /**
     * Connect to target using pairing information with the goal to pair / being taken over
     *
     * @param remotePersonId
     */
    public async connecOnceWithShortRunningChum(
        remotePersonId: SHA256IdHash<Person>
    ): Promise<void> {
        this.state.assertCurrentState('Initialised');

        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

        // Load the remote instance keys
        const localPublicInstanceKey = mainInstanceInfo.instanceKeys.publicEncryptionKey;
        let remotePublicInstanceKey: PublicKey;
        {
            const remoteSomeone = await this.leuteModel.getSomeone(remotePersonId);
            if (remoteSomeone === undefined) {
                throw new Error('Someone for specified personid was not found.');
            }
            const remoteProfile = await remoteSomeone.mainProfile();
            const instanceEndpoints = remoteProfile.endpointsOfType('OneInstanceEndpoint');
            if (instanceEndpoints.length === 0) {
                throw new Error('No endpoint exists for the specified person');
            }

            remotePublicInstanceKey = (await getPublicKeys(instanceEndpoints[0].instanceKeys))
                .publicEncryptionKey;
        }

        // Connect to target
        const connInfo = await connectWithEncryption(
            this.config.commServerUrl,
            localPublicInstanceKey,
            remotePublicInstanceKey,
            text => {
                if (!mainInstanceInfo) {
                    throw new Error('mainInstanceInfo not initialized.');
                }
                return mainInstanceInfo.cryptoApi.encryptAndEmbedNonce(
                    text,
                    remotePublicInstanceKey
                );
            },
            cypherText => {
                if (!mainInstanceInfo) {
                    throw new Error('mainInstanceInfo not initialized.');
                }
                return mainInstanceInfo.cryptoApi.decryptWithEmbeddedNonce(
                    cypherText,
                    remotePublicInstanceKey
                );
            }
        );

        // Add this connection to the communication module, so that it becomes the known connection
        this.communicationModule.replaceKnownConnection(
            localPublicInstanceKey,
            remotePublicInstanceKey,
            connInfo.connection,
            'Replaced connection for chum_one_time protocol'
        );

        // Start the pairing protocol
        try {
            // Send the other side the protocol we'd like to use
            await ConnectionsModel.sendMessage(connInfo.connection, {
                command: 'start_protocol',
                protocol: 'chum_one_time',
                version: '1.0'
            });

            await this.startChumProtocol(
                connInfo.connection,
                localPublicInstanceKey,
                remotePublicInstanceKey,
                mainInstanceInfo.personId,
                true,
                true,
                false,
                remotePersonId
            );
        } catch (e) {
            connInfo.connection.close(e.message);
            throw e;
        }
    }

    /**
     * Given the pairing information as parameter, the corresponding invitation will be invalidated.
     *
     * @param pairingInformation
     */
    public invalidateCurrentInvitation(pairingInformation: PairingInformation): void {
        this.state.assertCurrentState('Initialised');

        if (pairingInformation.takeOver) {
            this.pkOneTimeAuthenticationTokens.delete(pairingInformation.authenticationTag);
        } else {
            this.oneTimeAuthenticationTokens.delete(pairingInformation.authenticationTag);
        }
    }

    /**
     * Invalidate all existing invitations
     *
     * @param takeOver
     */
    public invalidateAllInvitations(takeOver: boolean): void {
        this.state.assertCurrentState('Initialised');

        if (takeOver) {
            this.pkOneTimeAuthenticationTokens.clear();
        } else {
            this.oneTimeAuthenticationTokens.clear();
        }
    }

    /**
     * This function is called whenever a connection with a known instance was established
     *
     * @param conn
     * @param localPublicInstanceKey
     * @param remotePublicInstanceKey
     * @param localPersonId
     * @param remotePersonId
     * @param initiatedLocally
     */
    private async onKnownConnection(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        MessageBus.send('log', `${conn.id}: onKnownConnection()`);

        if (!this.initialized) {
            return;
        }

        try {
            // On outgoing connections we use the chum protocol
            if (initiatedLocally) {
                await ConnectionsModel.sendMessage(conn, {
                    command: 'start_protocol',
                    protocol: 'chum',
                    version: '1.0'
                });
                await this.startChumProtocol(
                    conn,
                    localPublicInstanceKey,
                    remotePublicInstanceKey,
                    localPersonId,
                    true,
                    true,
                    true,
                    remotePersonId
                );
            }

            // On incoming connections we wait for the peer to select its protocol
            else {
                const protocolMsg = await ConnectionsModel.waitForMessage(conn, 'start_protocol');
                MessageBus.send(
                    'log',
                    `${conn.id}: Known: Start protocol ${protocolMsg.protocol} ${protocolMsg.version}`
                );

                // The normal chum protocol
                if (protocolMsg.protocol === 'chum' || protocolMsg.protocol === 'chum_one_time') {
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum protocol version.');
                    }

                    await this.startChumProtocol(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId,
                        false,
                        true,
                        !(protocolMsg.protocol === 'chum_one_time'),
                        remotePersonId
                    );
                }

                // Pairing protocol
                else if (protocolMsg.protocol === 'pairing') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chum_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum_onetimeauth_withtoken protocol version.');
                    }

                    await this.startPairingProtocol_Server(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId
                    );
                }

                // A chum with a one time auth token that was generated by this instance.
                // Used for pairing instances of other people.
                // Why support this in the known case? If the exchange of contact objects didn't work reliably
                // we need to be able to pair even if one of the peers thinks it is a known connection.
                else if (protocolMsg.protocol === 'chum_onetimeauth_withtoken') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chum_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum_onetimeauth_withtoken protocol version.');
                    }

                    await this.startChumOneTimeAuthProtocol_Server(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId
                    );
                }

                // Set the access groups on the remote machine
                else if (protocolMsg.protocol === 'accessGroup_set') {
                    if (!this.config.allowSetAuthGroup) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'accessGroup_set protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported accessGroup_set protocol version.');
                    }

                    await this.startSetAccessGroup_Server(conn, localPersonId);
                }

                // All other protocols
                else {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('Protocol not implemented.');
                }
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
     * @param localPublicInstanceKey
     * @param remotePublicInstanceKey
     * @param localPersonId
     * @param initiatedLocally
     */
    private async onUnknownConnection(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        MessageBus.send('log', `${conn.id}: onUnknownConnection()`);

        if (!this.initialized) {
            return;
        }

        try {
            // On outgoing connections we try to use the chum protocol
            if (initiatedLocally) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('Locally initiated connections should never be unknown.');
            }

            // On incoming connections we wait for the peer to select its protocol
            else {
                const protocolMsg = await ConnectionsModel.waitForMessage(conn, 'start_protocol');
                MessageBus.send(
                    'log',
                    `${conn.id}: Unknown: Start protocol ${protocolMsg.protocol} ${protocolMsg.version}`
                );

                // The normal chum protocol
                if (protocolMsg.protocol === 'chum' || protocolMsg.protocol === 'chum_one_time') {
                    if (!this.config.acceptUnknownPersons && !this.config.acceptUnknownInstances) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unknown connections are disabled by the configuration.');
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum protocol version.');
                    }

                    await this.startChumProtocol(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId,
                        false,
                        !this.config.acceptUnknownPersons,
                        !(protocolMsg.protocol === 'chum_one_time')
                    );
                }

                // Pairing protocol
                else if (protocolMsg.protocol === 'pairing') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chum_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum_onetimeauth_withtoken protocol version.');
                    }

                    await this.startPairingProtocol_Server(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId
                    );
                }

                // A chum with a one time auth token that was generated by this instance.
                // Used for pairing instances of other people.
                else if (protocolMsg.protocol === 'chum_onetimeauth_withtoken') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chum_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum_onetimeauth_withtoken protocol version.');
                    }

                    await this.startChumOneTimeAuthProtocol_Server(
                        conn,
                        localPublicInstanceKey,
                        remotePublicInstanceKey,
                        localPersonId
                    );
                }

                // Set the access groups on the remote machine
                else if (protocolMsg.protocol === 'accessGroup_set') {
                    if (!this.config.allowSetAuthGroup) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'accessGroup_set protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported accessGroup_set protocol version.');
                    }

                    await this.startSetAccessGroup_Server(conn, localPersonId);
                }

                // All other protocols
                else {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('Protocol not implemented.');
                }
            }
        } catch (e) {
            MessageBus.send('log', `${conn.id}: Unknown: Error in protocol ${e}`);
            conn.close(e.toString());
            return;
        }
    }

    // ################ CHUM PROTOCOL ################

    /**
     * Starts a chum after verifying the identity of the peer.
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Setup the chum
     *
     * @param conn - Connection to the peer.
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId - The local person id used to setup the chum
     * @param isClient - This is used to determine who sends messages first. Client should pass
     *                   true, server false.
     * @param contactShouldBeKnown - If this is true, then an error is thrown if we have seen this person
     *                               the first time.
     * @param remotePersonId - If this is passed in, then we expect this to be the person we set
     *                         the chum up with. If person key / id exchange resulted in a
     *                         different id, then an error
     * is thrown
     * @param keepRunning
     */
    private async startChumProtocol(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        isClient: boolean,
        contactShouldBeKnown: boolean,
        keepRunning: boolean = true,
        remotePersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await ConnectionsModel.verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            localPersonId,
            isClient,
            remotePersonId
        );

        // This should always be false, because we are in the onKnown* handler
        if (contactShouldBeKnown && remotePersonInfo.isNew) {
            throw new Error('You are not known. This should not happen, but ... it did.');
        }

        // Step 2: Start the chum
        await this.startChum(
            conn,
            localPublicInstanceKey,
            remotePublicInstanceKey,
            localPersonId,
            remotePersonInfo.personId,
            'chum',
            isClient,
            keepRunning
        );
        conn.close();
    }

    // ################ PAIRING PROTOCOL ################

    /**
     * Starts the pairing process after verifying a one time auth token.
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Wait for and verify authentication token by comparing to local list
     * Step 3&4: Exchange identity, so that profiles re generated
     *
     * @param conn - Connection to the peer.
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId - The local person id used to setup the chum
     */
    private async startPairingProtocol_Server(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>
    ): Promise<void> {
        // const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await ConnectionsModel.verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            localPersonId,
            false
        );
        // We do not need to check whether the person is new, because both new or not new is ok here

        // Step 2: Wait for the authentication token and verify it against the token list
        const authToken = await ConnectionsModel.waitForMessage(conn, 'authentication_token');

        // Verify the auth token
        const authData = this.oneTimeAuthenticationTokens.get(authToken.token);
        if (authData === undefined) {
            throw new Error('Authentication token is not existing.');
        }

        // Verify the received id with the local id used to generate the code
        if (authData.localPersonId !== localPersonId) {
            throw new Error('The authentication token was not generated for the requested person.');
        }

        // Step 3: Send my own identity
        const myProfile = await (await this.leuteModel.me()).mainProfile();
        const oneInstanceEndpoints = myProfile.endpointsOfType('OneInstanceEndpoint');
        if (oneInstanceEndpoints.length === 0) {
            throw new Error(
                'Cannot exchange identity, the main profile does not contain a OneInstanceEndpoint'
            );
        }
        await ConnectionsModel.sendMessage(conn, {
            command: 'identity',
            obj: await convertOneInstanceEndpointToIdentity(oneInstanceEndpoints[0])
        });

        // Step 4: Wait for remote identity
        const remoteIdentity = (await ConnectionsModel.waitForMessage(conn, 'identity')).obj;
        await convertIdentityToProfile(remoteIdentity);

        // Done, so remove the one time authentication token from the list
        clearTimeout(authData.expirationTimeoutHandle);
        this.oneTimeAuthenticationTokens.delete(authToken.token);

        // Notify the app of successful pairing and then close the connection.
        await this.onOneTimeAuthSuccess.emitAll(
            authToken.token,
            true,
            localPersonId,
            remotePersonInfo.personId
        );

        conn.close();
    }

    /**
     * Starts the pairing process after verifying a one time auth token.
     *
     * This is used for the initial connection when you have received an authentication token through a secure channel
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Send authentication token
     * Step 3&4: Exchange identity, so that profiles re generated
     *
     * @param conn - Connection to the peer.
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId - The local person id used to setup the chum
     * @param authenticationToken - The authentication token received via a secure channel from
     *                              the peer
     */
    private async startPairingProtocol_Client(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        authenticationToken: string
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const personInfo = await ConnectionsModel.verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            localPersonId,
            true
        );

        // Step 2: Send the authentication token
        await ConnectionsModel.sendMessage(conn, {
            command: 'authentication_token',
            token: authenticationToken
        });

        // Step 3: Wait for remote identity
        const remoteIdentity = (await ConnectionsModel.waitForMessage(conn, 'identity')).obj;
        await convertIdentityToProfile(remoteIdentity);

        // Step 4: Send my own identity
        const myProfile = await (await this.leuteModel.me()).mainProfile();
        const oneInstanceEndpoints = myProfile.endpointsOfType('OneInstanceEndpoint');
        if (oneInstanceEndpoints.length === 0) {
            throw new Error(
                'Cannot exchange identity, the main profile does not contain a OneInstanceEndpoint'
            );
        }
        await ConnectionsModel.sendMessage(conn, {
            command: 'identity',
            obj: await convertOneInstanceEndpointToIdentity(oneInstanceEndpoints[0])
        });

        // Notify the app of successful pairing and then close the connection.
        await this.onOneTimeAuthSuccess.emitAll(
            authenticationToken,
            false,
            localPersonId,
            personInfo.personId
        );

        conn.close();
    }

    // ################ ONE TIME AUTH PROTOCOL (PAIRING) ################

    /**
     * Starts a chum after verifying a one time auth token.
     *
     * This is used for the initial connection when you have a secure way of transferring
     * an authentication token.
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Wait for and verify authentication token by comparing to local list
     * Step 3: Exchange person objects (needed for setting up access rights) -> TODO: shouldn't be part of this workflow ...
     * Step 4: Setup the chum
     *
     * @param conn - Connection to the peer.
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId - The local person id used to setup the chum
     */
    private async startChumOneTimeAuthProtocol_Server(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>
    ): Promise<void> {
        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await ConnectionsModel.verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            localPersonId,
            false
        );
        // We do not need to check whether the person is new, because both new or not new is ok here

        // Step 2: Wait for the authentication token and verify it against the token list
        const authToken = await ConnectionsModel.waitForMessage(conn, 'authentication_token');

        // Verify the auth token
        const authData = this.oneTimeAuthenticationTokens.get(authToken.token);
        if (authData === undefined) {
            throw new Error('Authentication token is not existing.');
        }

        // Verify the received id with the local id used to generate the code
        if (authData.localPersonId !== localPersonId) {
            throw new Error('The authentication token was not generated for the requested person.');
        }

        // Step 3: Exchange person objects (first send, second receive)
        const localPersonObj = await getIdObject(mainInstanceInfo.personId);
        await ConnectionsModel.sendMessage(conn, {
            command: 'person_object',
            obj: localPersonObj
        });
        const remotePersonObj = (await ConnectionsModel.waitForMessage(conn, 'person_object')).obj;
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            remotePersonObj
        );

        // Done, so remove the one time authentication token from the list
        clearTimeout(authData.expirationTimeoutHandle);
        this.oneTimeAuthenticationTokens.delete(authToken.token);

        await this.onOneTimeAuthSuccess.emitAll(
            authToken.token,
            true,
            localPersonId,
            remotePersonInfo.personId
        );

        // Step 4: Start the short running chum
        try {
            await this.startChum(
                conn,
                localPublicInstanceKey,
                remotePublicInstanceKey,
                localPersonId,
                remotePersonInfo.personId,
                'chum_onetimeauth_withtoken',
                false,
                false
            );
        } catch (e) {
            console.error('Short chum for pairing failed', e);
        }

        await this.onOneTimeAuthSuccessFirstSync.emitAll(
            authToken.token,
            true,
            localPersonId,
            remotePersonInfo.personId
        );

        conn.close();
    }

    /**
     * Starts a chum by authenticating with a one time authentication token at the peer.
     *
     * This is used for the initial connection when you have received an authentication token through a secure channel
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Send authentication token
     * Step 3: Exchange person objects (needed for setting up access rights) -> TODO: shouldn't be part of this workflow ...
     * Step 4: Setup the chum
     *
     * @param conn - Connection to the peer.
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId - The local person id used to setup the chum
     * @param authenticationToken - The authentication token received via a secure channel from
     *                              the peer
     */
    private async startChumOneTimeAuthProtocol_Client(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        authenticationToken: string
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const personInfo = await ConnectionsModel.verifyAndExchangePersonId(
            this.leuteModel,
            conn,
            localPersonId,
            true
        );

        // Step 2: Send the authentication token
        await ConnectionsModel.sendMessage(conn, {
            command: 'authentication_token',
            token: authenticationToken
        });

        // Step 3: Exchange person objects (first receive, second send)
        const remotePersonObj = (await ConnectionsModel.waitForMessage(conn, 'person_object')).obj;
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            remotePersonObj
        );
        const localPersonObj = await getIdObject(localPersonId);
        await ConnectionsModel.sendMessage(conn, {
            command: 'person_object',
            obj: localPersonObj
        });

        // emit the one_time_auth_success event with the corresponding authentication token
        await this.onOneTimeAuthSuccess.emitAll(
            authenticationToken,
            false,
            localPersonId,
            personInfo.personId
        );

        // Step 4: Start the short running chum
        try {
            await this.startChum(
                conn,
                localPublicInstanceKey,
                remotePublicInstanceKey,
                localPersonId,
                personInfo.personId,
                'chum_onetimeauth_withtoken',
                true,
                false
            );
        } catch (e) {
            console.error('Short chum for pairing failed', e);
        }

        await this.onOneTimeAuthSuccessFirstSync.emitAll(
            authenticationToken,
            false,
            localPersonId,
            personInfo.personId
        );

        conn.close();
    }

    // ################ SET AUTH GROUP ################

    private async startSetAccessGroup_Server(
        conn: Connection,
        localPersonId: SHA256IdHash<Person>
    ): Promise<void> {
        try {
            // const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

            // Step 1: Exchange / authenticate person keys & person Id
            const remotePersonInfo = await ConnectionsModel.verifyAndExchangePersonId(
                this.leuteModel,
                conn,
                localPersonId,
                false
            );

            // Step 2: Wait for the authentication token and verify it against the token list
            const accessGroupMembers = await ConnectionsModel.waitForMessage(
                conn,
                'access_group_members'
            );

            // Store the new group members and send success
            const personObjs = await Promise.all(
                accessGroupMembers.persons.map(person =>
                    createSingleObjectThroughPurePlan(
                        {
                            module: '@one/identity',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        {
                            $type$: 'Person',
                            email: person
                        }
                    )
                )
            );
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'Group',
                    name: 'person_' + remotePersonInfo.personId,
                    person: personObjs.map(personObj => personObj.idHash)
                }
            );

            // Step 3: Send success message
            await ConnectionsModel.sendMessage(conn, {
                command: 'success'
            });

            // Wait for the other side to process the close message.
            await wait(1000);
        } finally {
            conn.close();
        }
    }

    /**
     * Starts a chum by authenticating with a one time authentication token at the peer.
     *
     * This is used for the initial connection when you have received an authentication token through a secure channel
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Send authentication token
     * Step 3: Exchange person objects (needed for setting up access rights) -> TODO: shouldn't be part of this workflow ...
     * Step 4: Setup the chum
     *
     * @param conn - Connection to the peer.
     * @param localPersonId - The local person id used to setup the chum
     * @param remotePersonId
     * @param accessGroupMembers
     */
    private async startSetAccessGroup_Client(
        conn: Connection,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        accessGroupMembers: SHA256IdHash<Person>[]
    ): Promise<void> {
        try {
            // Step 1: Exchange / authenticate person keys & person Id
            await ConnectionsModel.verifyAndExchangePersonId(
                this.leuteModel,
                conn,
                localPersonId,
                true,
                remotePersonId
            );

            // Step 2: Send the group members
            const personObjs = await Promise.all(
                accessGroupMembers.map(person => getIdObject(person))
            );
            const personEmails = personObjs.map(personObj => personObj.email);
            await ConnectionsModel.sendMessage(conn, {
                command: 'access_group_members',
                persons: personEmails
            });

            // Step 3: Wait for success message from the other side.
            await ConnectionsModel.waitForMessage(conn, 'success');
        } finally {
            conn.close();
        }
    }

    // ################ Others ################

    /**
     * Starts the corresponding chum connection.
     *
     * @param conn
     * @param localPublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
     * connections.
     * @param localPersonId
     * @param remotePersonId
     * @param protocol
     * @param initiatedLocally
     * @param keepRunning
     */
    private async startChum(
        conn: Connection,
        localPublicInstanceKey: Uint8Array,
        remotePublicInstanceKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        protocol: CommunicationInitiationProtocol.Protocols,
        initiatedLocally: boolean,
        keepRunning: boolean = true
    ): Promise<void> {
        await this.onChumStart.emitAll(
            localPersonId,
            remotePersonId,
            protocol,
            initiatedLocally,
            keepRunning
        );

        // Send synchronisation messages to make sure both instances start the chum at the same time.
        conn.send('synchronisation');
        await conn.promisePlugin().waitForMessage();
        conn.removePlugin('promise');

        // Core takes either the ws package or the default websocket
        // depending on for what environment it was compiled. In this
        // project we use the isomorphic-ws library for this. This is
        // why we need to ignore the below error, because after compilation
        // the types of the websockets will be the same.
        const websocketPromisifierAPI = createWebsocketPromisifier(conn);

        await createChum({
            connection: websocketPromisifierAPI,
            remotePersonId,

            // used only for logging purpose
            chumName: 'ConnectionsChum',
            localInstanceName: uint8arrayToHexString(localPublicInstanceKey),
            remoteInstanceName: uint8arrayToHexString(remotePublicInstanceKey),

            keepRunning,
            maxNotificationDelay: 20
        }).promise;
    }

    /**
     * Extract all private keys public keys and other private information from the current instance.
     *
     * The returned private keys are encrypted using the instance secret.
     *
     * IMPORTANT: this function is used also in RecoveryModel.
     *
     * @returns
     */
    async extractExistingPersonKeys(): Promise<CommunicationInitiationProtocol.PrivatePersonInformationMessage> {
        const mainInstanceInfo = await this.leuteModel.getMyMainInstance();

        // Obtain the main keys
        const mainPersonKeys = await ConnectionsModel.extractKeysForPerson(
            mainInstanceInfo.personId
        );
        const mainPublicKeys = mainPersonKeys.personPublicKeys;
        const mainPrivateEncryptionKey = mainPersonKeys.personPrivateEncryptionKey;
        const mainPrivateSignKey = mainPersonKeys.personPrivateSignKey;

        // Check for the existence of sign keys
        if (!mainPublicKeys.publicSignKey) {
            throw new Error('Main person does not have a sign key');
        }

        return {
            command: 'private_person_information',
            personId: mainInstanceInfo.personId,
            personPublicKey: mainPublicKeys.publicKey,
            personPublicSignKey: mainPublicKeys.publicSignKey,
            personPrivateKey: mainPrivateEncryptionKey,
            personPrivateSignKey: mainPrivateSignKey
        };
    }

    // ######## Update internal state functions #######

    /**
     * Extract public ans encrypted private keys for the person received as parameter.
     *
     * @param personId
     * @returns
     * @private
     */
    private static async extractKeysForPerson(personId: SHA256IdHash<Person>): Promise<{
        personPublicKeys: Keys;
        personPrivateEncryptionKey: HexString;
        personPrivateSignKey: HexString;
    }> {
        throw new Error('This will not work anymore, because the key files changed');

        /*const readPrivateKeys = async (filename: string): Promise<HexString> => {
            return (await readUTF8TextFile(filename, 'private')) as HexString;
        };

        const personKeyLink = await getAllEntries(personId, 'Keys');
        const personPublicKeys = await getObjectWithType(
            personKeyLink[personKeyLink.length - 1],
            'Keys'
        );
        const personPrivateEncryptionKey = await readPrivateKeys(
            `${personKeyLink[personKeyLink.length - 1]}.owner.encrypt`
        );
        const personPrivateSignKey = await readPrivateKeys(
            `${personKeyLink[personKeyLink.length - 1]}.owner.sign`
        );

        return {
            personPublicKeys: personPublicKeys,
            personPrivateEncryptionKey: personPrivateEncryptionKey,
            personPrivateSignKey: personPrivateSignKey
        };*/
    }

    // ######## Person key verification #######

    /**
     * This process exchanges and verifies person keys.
     *
     * The verification checks the following:
     * - Does the peer have the private key to the corresponding public key
     * - Does the peer use the same key as the last time (key lookup in storage)
     *   -> skipped if
     * - Does the person id communicated by the peer match the expected person id
     *   -> Only checked if matchRemotePersonId is specified
     *
     * @param leute
     * @param conn - The connection used to exchange this data
     * @param localPersonId - The local person id (used for getting keys)
     * @param initiatedLocally
     * @param matchRemotePersonId - It is verified that the transmitted person id matches this one.
     * @param skipLocalKeyCompare - Skips the comparision of local keys. Defaults to false. Use
     *                              with care!
     * @returns
     */
    private static async verifyAndExchangePersonId(
        leute: LeuteModel,
        conn: Connection,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean,
        matchRemotePersonId?: SHA256IdHash<Person>,
        skipLocalKeyCompare?: boolean
    ): Promise<{
        isNew: boolean;
        personId: SHA256IdHash<Person>;
        personPublicKey: PublicKey;
    }> {
        // Initialize the crypto stuff
        const crypto = await createCryptoApiFromDefaultKeys(localPersonId);

        // Get my own person key
        const localPersonKey = (await getPublicKeys(await getDefaultKeys(localPersonId)))
            .publicEncryptionKey;

        // Exchange and challenge response the person keys
        let remotePersonId: SHA256IdHash<Person>;
        let remotePersonKey: PublicKey;
        if (initiatedLocally) {
            // Step1: Send my person information
            await ConnectionsModel.sendMessage(conn, {
                command: 'person_information',
                personId: localPersonId,
                personPublicKey: uint8arrayToHexString(localPersonKey)
            });

            // Step 2: Wait for remote information
            const remotePersonInfo = await ConnectionsModel.waitForMessage(
                conn,
                'person_information'
            );
            remotePersonId = remotePersonInfo.personId;
            remotePersonKey = ensurePublicKey(hexToUint8Array(remotePersonInfo.personPublicKey));

            // Step 3: Perform challenge / response
            await ConnectionsModel.challengePersonKey(conn, remotePersonKey, crypto);

            // Step 4: Answer challenge response
            await ConnectionsModel.challengeRespondPersonKey(conn, remotePersonKey, crypto);
        } else {
            // Step 1: Wait for remote information
            const remotePersonInfo = await ConnectionsModel.waitForMessage(
                conn,
                'person_information'
            );
            remotePersonId = remotePersonInfo.personId;
            remotePersonKey = ensurePublicKey(hexToUint8Array(remotePersonInfo.personPublicKey));

            // Step2: Send my person information
            await ConnectionsModel.sendMessage(conn, {
                command: 'person_information',
                personId: localPersonId,
                personPublicKey: uint8arrayToHexString(localPersonKey)
            });

            // Step 3: Answer challenge response
            await ConnectionsModel.challengeRespondPersonKey(conn, remotePersonKey, crypto);

            // Step 4: Perform challenge / response
            await ConnectionsModel.challengePersonKey(conn, remotePersonKey, crypto);
        }

        // Verify that the remote person id is the same as the one we have from the callback
        if (matchRemotePersonId && remotePersonId !== matchRemotePersonId) {
            throw new Error('The person id does not match the one we have on record.');
        }

        // Verify that the transmitted key matches the one we already have
        let keyComparisionFailed: boolean = true;
        try {
            const remoteEndpoints = await leute.findAllOneInstanceEndpointsForPerson(
                remotePersonId
            );

            for (const remoteEndpoint of remoteEndpoints) {
                if (remoteEndpoint.personKeys === undefined) {
                    continue;
                }

                const keys = await getPublicKeys(remoteEndpoint.personKeys);
                if (tweetnacl.verify(remotePersonKey, keys.publicEncryptionKey)) {
                    keyComparisionFailed = false;
                    // we do not break here - for constant execution times
                }
            }
        } catch (e) {
            // This means that we have not encountered the person, yet.
            return {
                isNew: true,
                personId: remotePersonId,
                personPublicKey: remotePersonKey
            };
        }

        // Throw error when key comparision failed.
        if (keyComparisionFailed && !skipLocalKeyCompare) {
            throw new Error('Key does not match your previous visit');
        }

        // If we made it to here, then everything checked out => person is authenticated against the stored data
        return {
            isNew: false,
            personId: remotePersonId,
            personPublicKey: remotePersonKey
        };
    }

    /**
     * Challenge the remote peer for proving that he has the private key
     *
     * @param conn
     * @param remotePersonPublicKey
     * @param crypto
     */
    private static async challengePersonKey(
        conn: Connection,
        remotePersonPublicKey: PublicKey,
        crypto: CryptoApi
    ): Promise<void> {
        // Send the challenge
        const challenge = tweetnacl.randomBytes(64);
        const encryptedChallenge = crypto.encryptAndEmbedNonce(challenge, remotePersonPublicKey);
        conn.send(encryptedChallenge);
        for (let i = 0; i < challenge.length; ++i) {
            challenge[i] = ~challenge[i];
        }

        // Wait for response
        const encryptedResponse = await conn.promisePlugin().waitForBinaryMessage();
        const response = crypto.decryptWithEmbeddedNonce(encryptedResponse, remotePersonPublicKey);
        if (!tweetnacl.verify(challenge, response)) {
            conn.close();
            throw new Error('Failed to authenticate connection.');
        }
    }

    /**
     * Wait for a challenge and prove that we have the private key.
     *
     * @param conn
     * @param remotePersonPublicKey
     * @param crypto
     */
    private static async challengeRespondPersonKey(
        conn: Connection,
        remotePersonPublicKey: PublicKey,
        crypto: CryptoApi
    ): Promise<void> {
        // Wait for challenge
        const encryptedChallenge = await conn.promisePlugin().waitForBinaryMessage();
        const challenge = crypto.decryptWithEmbeddedNonce(
            encryptedChallenge,
            remotePersonPublicKey
        );
        for (let i = 0; i < challenge.length; ++i) {
            challenge[i] = ~challenge[i];
        }
        const encryptedResponse = crypto.encryptAndEmbedNonce(challenge, remotePersonPublicKey);
        conn.send(encryptedResponse);
    }

    // ######## Low level io functions (should probably part of a class??? #######

    /**
     * Send a peer message
     *
     * @param conn
     * @param message - The message to send
     */
    private static async sendMessage<T extends CommunicationInitiationProtocol.PeerMessageTypes>(
        conn: Connection,
        message: T
    ): Promise<void> {
        conn.send(JSON.stringify(message));
    }

    /**
     * Wait for a peer message
     *
     * @param conn
     * @param command - the command to wait for
     * @returns
     */
    public static async waitForMessage<
        T extends keyof CommunicationInitiationProtocol.PeerMessages
    >(conn: Connection, command: T): Promise<CommunicationInitiationProtocol.PeerMessages[T]> {
        const message = await conn.promisePlugin().waitForJSONMessageWithType(command, 'command');
        if (isPeerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }
}

export default ConnectionsModel;
