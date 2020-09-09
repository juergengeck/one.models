import EventEmitter from 'events';
import CommunicationModule, {ConnectionInfo} from '../misc/CommunicationModule';
import ContactModel from './ContactModel';
import InstancesModel, {LocalInstanceInfo} from './InstancesModel';
import EncryptedConnection from '../misc/EncryptedConnection';
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectWithType,
    VERSION_UPDATES,
    WriteStorageApi
} from 'one.core/lib/storage';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {
    createCrypto,
    CryptoAPI,
    decryptWithSymmetricKey,
    encryptWithSymmetricKey,
    overwritePersonKeys,
    stringToUint8Array,
    Uint8ArrayToString
} from 'one.core/lib/instance-crypto';
import OutgoingConnectionEstablisher from '../misc/OutgoingConnectionEstablisher';
import {fromByteArray, toByteArray} from 'base64-js';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import tweetnacl from 'tweetnacl';
import CommunicationInitiationProtocol, {
    isPeerMessage
} from '../misc/CommunicationInitiationProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from '../misc/LogUtils';
import {scrypt} from 'one.core/lib/system/crypto-scrypt';
import {readUTF8TextFile, writeUTF8TextFile} from 'one.core/lib/system/storage-base';

const MessageBus = createMessageBus('ConnectionsModel');

/**
 * This is the information that needs to pe transmitted securely to the device that shall be paired
 *
 * TODO: the content should be cleaned up.
 */
export type PairingInformation = {
    authenticationTag: string;
    publicKeyLocal: string;
    url: string;
    takeOver: boolean;
    takeOverDetails?: TakeOverInformation;
};

/**
 * Additional information for instance takeover.
 */
export type TakeOverInformation = {
    nonce: string;
    email: string;
    anonymousEmail: string;
};

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

    // #### Outgoing connection configuration ####
    // If true automatically establish outgoing connections
    // Default: true
    establishOutgoingConnections: boolean;

    // If true then use the anon id as local id for outgoing connections
    connectToOthersWithAnonId: boolean;
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
class ConnectionsModel extends EventEmitter {
    // Global settings
    public config: ConnectionsModelConfiguration;

    // Models
    private readonly instancesModel: InstancesModel;
    private communicationModule: CommunicationModule;

    // State variables
    private initialized: boolean; // Flag that stores whether this module is initialized

    // Internal maps and lists (precomputed on init)
    private mainInstanceInfo: LocalInstanceInfo | null; // My person info
    private anonInstanceInfo: LocalInstanceInfo | null; // My person info - anonymous id -> TODO: should be removed in the future

    // Other stuff
    private oneTimeAuthenticationTokens: Map<string, AuthenticationTokenInfo>;
    private pkOneTimeAuthenticationTokens: Map<string, PkAuthenticationTokenInfo>;

    // TODO: try to remove the password dependency
    private password: string;

    /**
     * Retrieve the online state based on connections to comm servers.
     *
     * If we don't have connections to comm servers, the state will always be true.
     *
     * @returns {boolean}
     */
    public get onlineState(): boolean {
        return this.communicationModule.onlineState;
    }

    /**
     * Construct a new instance
     *
     * @param {ContactModel} contactModel
     * @param {InstancesModel} instancesModel
     * @param {Partial<ConnectionsModel.Configuration>} config
     */
    constructor(
        contactModel: ContactModel,
        instancesModel: InstancesModel,
        config: Partial<ConnectionsModelConfiguration>
    ) {
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
            establishOutgoingConnections:
                config.establishOutgoingConnections !== undefined
                    ? config.establishOutgoingConnections
                    : false,
            connectToOthersWithAnonId:
                config.connectToOthersWithAnonId !== undefined
                    ? config.connectToOthersWithAnonId
                    : true
        };

        // Setup / init modules
        this.instancesModel = instancesModel;
        this.communicationModule = new CommunicationModule(
            this.config.commServerUrl,
            contactModel,
            instancesModel,
            this.config.establishOutgoingConnections,
            this.config.connectToOthersWithAnonId
        );
        this.communicationModule.onKnownConnection = this.onKnownConnection.bind(this);
        this.communicationModule.onUnknownConnection = this.onUnknownConnection.bind(this);
        this.communicationModule.on('onlineStateChange', state => {
            this.emit('onlineStateChange', state);
        });
        this.communicationModule.on('connectionsChange', state => {
            this.emit('connectionsChange', state);
        });

        // Changed by init
        this.initialized = false;
        this.mainInstanceInfo = null;
        this.anonInstanceInfo = null;
        this.oneTimeAuthenticationTokens = new Map<string, AuthenticationTokenInfo>();
        this.pkOneTimeAuthenticationTokens = new Map<string, PkAuthenticationTokenInfo>();

        this.password = '';
    }

    /**
     * Initialize this module.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        this.initialized = true;

        await this.updateInstanceInfos();
        await this.communicationModule.init();

        if (!this.mainInstanceInfo) {
            throw new Error('Programming error: mainInstanceInfo is not initialized');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('Programming error: anonInstanceInfo is not initialized');
        }
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    public async shutdown(): Promise<void> {
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

        this.mainInstanceInfo = null;
        this.anonInstanceInfo = null;
    }

    /**
     *
     * @returns {ConnectionInfo[]}
     */
    public connectionsInfo(): ConnectionInfo[] {
        return this.communicationModule.connectionsInfo();
    }

    /**
     * The password needs to be memorised for personal cloud connections authentication.
     *
     * TODO: remove me and ask the user instead. Long term storage is a bad idea!
     *
     * @param {string} password
     */
    public setPassword(password: string) {
        this.password = password;
    }

    /**
     * Generates the information for sharing which will be sent in the QR code.
     *
     * @param {boolean} takeOver
     * @returns {Promise<PairingInformation>}
     */
    public async generatePairingInformation(takeOver: boolean): Promise<PairingInformation> {
        if (!this.initialized) {
            throw new Error('Module is not initialized!');
        }
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized.');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('anonInstanceInfo not initialized.');
        }

        const authenticationToken = await createRandomString();

        if (takeOver) {
            const myEmail = (await getObjectByIdHash(this.mainInstanceInfo.personId)).obj.email;
            const myAnonEmail = (await getObjectByIdHash(this.anonInstanceInfo.personId)).obj.email;
            const salt = tweetnacl.randomBytes(64);

            // Set up the expiration of the token
            const expirationTimeoutHandle = setTimeout(
                () => this.pkOneTimeAuthenticationTokens.delete(authenticationToken),
                this.config.authTokenExpirationDuration
            );

            // Add the token to the list of valid tokens
            this.pkOneTimeAuthenticationTokens.set(authenticationToken, {
                token: authenticationToken,
                localPersonId: this.mainInstanceInfo.personId,
                salt: salt,
                expirationTimeoutHandle
            });

            // Build and return the pairing information that is transferred to the other instance e.g. by qr code
            return {
                authenticationTag: authenticationToken,
                publicKeyLocal: this.mainInstanceInfo.instanceKeys.publicKey,
                url: this.config.commServerUrl,
                takeOver: true,
                takeOverDetails: {
                    nonce: fromByteArray(salt),
                    email: myEmail,
                    anonymousEmail: myAnonEmail
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
                localPersonId: this.anonInstanceInfo.personId,
                expirationTimeoutHandle
            });

            // Build and return the pairing information that is transferred to the other instance e.g. by qr code
            return {
                authenticationTag: authenticationToken,
                publicKeyLocal: this.anonInstanceInfo.instanceKeys.publicKey,
                url: this.config.commServerUrl,
                takeOver: false
            };
        }
    }

    /**
     * Connect to target using pairing information with the goal to pair / being taken over
     *
     * @param {PairingInformation} pairingInformation
     * @param {string} password
     * @returns {Promise<void>}
     */
    public async connectUsingPairingInformation(
        pairingInformation: PairingInformation,
        password: string
    ): Promise<void> {
        if (!this.initialized) {
            throw new Error('Module is not initialized!');
        }

        const remotePublicKey = toByteArray(pairingInformation.publicKeyLocal);

        // Case of takeover
        if (pairingInformation.takeOver) {
            if (!pairingInformation.takeOverDetails) {
                throw new Error('Incomplete pairing information');
            }
            if (!this.mainInstanceInfo) {
                throw new Error('mainInstanceInfo not initialized.');
            }

            // Connect to target
            const conn = await OutgoingConnectionEstablisher.connectOnce(
                this.config.commServerUrl,
                toByteArray(this.mainInstanceInfo.instanceKeys.publicKey),
                remotePublicKey,
                text => {
                    if (!this.mainInstanceInfo) {
                        throw new Error('mainInstanceInfo not initialized.');
                    }
                    return this.mainInstanceInfo.cryptoApi.encryptWithInstancePublicKey(
                        remotePublicKey,
                        text
                    );
                },
                cypherText => {
                    if (!this.mainInstanceInfo) {
                        throw new Error('mainInstanceInfo not initialized.');
                    }
                    return this.mainInstanceInfo.cryptoApi.decryptWithInstancePublicKey(
                        remotePublicKey,
                        cypherText
                    );
                }
            );

            // Add this connection to the communication module, so that it becomes the known connection
            this.communicationModule.addNewUnknownConnection(
                toByteArray(this.mainInstanceInfo.instanceKeys.publicKey),
                remotePublicKey,
                conn
            );

            // Start the takeover protocol
            try {
                // Send the other side the protocol we'd like to use
                await ConnectionsModel.sendMessage(conn, {
                    command: 'start_protocol',
                    protocol: 'chumAndPkExchange_onetimeauth_withtoken',
                    version: '1.0'
                });

                // STart the selected protocol
                await this.startChumPkExchangeProtocol_Client(
                    conn,
                    this.mainInstanceInfo.personId,
                    pairingInformation.authenticationTag,
                    toByteArray(pairingInformation.takeOverDetails.nonce),
                    this.password
                );
            } catch (e) {
                conn.close(e.message);
                throw e;
            }
        }

        // Case for normal pairing
        else {
            if (!this.anonInstanceInfo) {
                throw new Error('anonInstanceInfo not initialized.');
            }

            // Connect to target
            const conn = await OutgoingConnectionEstablisher.connectOnce(
                this.config.commServerUrl,
                toByteArray(this.anonInstanceInfo.instanceKeys.publicKey),
                toByteArray(pairingInformation.publicKeyLocal),
                text => {
                    if (!this.anonInstanceInfo) {
                        throw new Error('anonInstanceInfo not initialized.');
                    }
                    return this.anonInstanceInfo.cryptoApi.encryptWithInstancePublicKey(
                        remotePublicKey,
                        text
                    );
                },
                cypherText => {
                    if (!this.anonInstanceInfo) {
                        throw new Error('anonInstanceInfo not initialized.');
                    }
                    return this.anonInstanceInfo.cryptoApi.decryptWithInstancePublicKey(
                        remotePublicKey,
                        cypherText
                    );
                }
            );

            // Add this connection to the communication module, so that it becomes the known connection
            this.communicationModule.addNewUnknownConnection(
                toByteArray(this.anonInstanceInfo.instanceKeys.publicKey),
                remotePublicKey,
                conn
            );

            // Start the pairing protocol
            try {
                // Send the other side the protocol we'd like to use
                await ConnectionsModel.sendMessage(conn, {
                    command: 'start_protocol',
                    protocol: 'chum_onetimeauth_withtoken',
                    version: '1.0'
                });

                // Start the selected protocol
                await this.startChumOneTimeAuthProtocol_Client(
                    conn,
                    this.anonInstanceInfo.personId,
                    pairingInformation.authenticationTag
                );
            } catch (e) {
                conn.close(e.message);
                throw e;
            }
        }
    }

    /**
     * Given the pairing information as parameter, the corresponding invitation will be invalidated.
     *
     * @param {PairingInformation} pairingInformation
     */
    public invalidateCurrentInvitation(pairingInformation: PairingInformation): void {
        if (pairingInformation.takeOver) {
            this.pkOneTimeAuthenticationTokens.delete(pairingInformation.authenticationTag);
        } else {
            this.oneTimeAuthenticationTokens.delete(pairingInformation.authenticationTag);
        }
    }

    /**
     * Invalidate all existing invitations
     *
     * @param {boolean} takeOver
     */
    public invalidateAllInvitations(takeOver: boolean): void {
        if (takeOver) {
            this.pkOneTimeAuthenticationTokens.clear();
        } else {
            this.oneTimeAuthenticationTokens.clear();
        }
    }

    /**
     * This function is called whenever a connection with a known instance was established
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {SHA256IdHash<Person>} remotePersonId
     * @param {boolean} initiatedLocally
     * @returns {Promise<void>}
     */
    private async onKnownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(conn.webSocket)}: onKnownConnection()`);

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
                await this.startChumProtocol(conn, localPersonId, true, true, remotePersonId);
            }

            // On incoming connections we wait for the peer to select its protocol
            else {
                const protocolMsg = await ConnectionsModel.waitForMessage(conn, 'start_protocol');

                // The normal chum protocol
                if (protocolMsg.protocol === 'chum') {
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error('Unsupported chum protocol version.');
                    }

                    await this.startChumProtocol(conn, localPersonId, false, true, remotePersonId);
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

                    await this.startChumOneTimeAuthProtocol_Server(conn, localPersonId);
                }

                // A chum and private key exchange protocol.
                // Used for pairing internet of me devices
                // Why support this in the known case? If the exchange of contact objects didn't work reliably
                // we need to be able to pair even if one of the peers thinks it is a known connection.
                else if (protocolMsg.protocol === 'chumAndPkExchange_onetimeauth_withtoken') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chumAndPkExchange_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'Unsupported chumAndPkExchange_onetimeauth_withtoken protocol version.'
                        );
                    }

                    await this.startChumPkExchangeProtocol_Server(conn, localPersonId);
                }

                // All other protocols
                else {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('Protocol not implemented.');
                }
            }
        } catch (e) {
            conn.close(e.toString());
            return;
        }
    }

    /**
     * This function is called whenever a connection with an unknown instance was established
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {boolean} initiatedLocally
     * @returns {Promise<void>}
     */
    private async onUnknownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(conn.webSocket)}: onUnknownConnection()`);

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

                // The normal chum protocol
                if (protocolMsg.protocol === 'chum') {
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
                        localPersonId,
                        false,
                        !this.config.acceptUnknownPersons
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

                    await this.startChumOneTimeAuthProtocol_Server(conn, localPersonId);
                }

                // A chum and private key exchange protocol.
                // Used for pairing internet of me devices
                else if (protocolMsg.protocol === 'chumAndPkExchange_onetimeauth_withtoken') {
                    if (!this.config.allowOneTimeAuth) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'chumAndPkExchange_onetimeauth_withtoken protocol is disabled through configuration.'
                        );
                    }
                    if (protocolMsg.version !== '1.0') {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(
                            'Unsupported chumAndPkExchange_onetimeauth_withtoken protocol version.'
                        );
                    }

                    await this.startChumPkExchangeProtocol_Server(conn, localPersonId);
                }

                // All other protocols
                else {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error('Protocol not implemented.');
                }
            }
        } catch (e) {
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
     * @param {EncryptedConnection} conn - Connection to the peer.
     * @param {SHA256IdHash<Person>} localPersonId - The local person id used to setup the chum
     * @param {boolean} isClient - This is used to determine who sends messages first. Client should pass true,
     *                             server false.
     * @param {boolean} contactShouldBeKnown - If this is true, then an error is thrown if we have seen this person
     *                                         the first time.
     * @param {SHA256IdHash<Person>|undefined} remotePersonId - If this is passed in, then we expect this to be the
     *                                                          person we set the chum up with. If person key / id
     *                                                          exchange resulted in a different id, then an error
     *                                                          is thrown
     * @returns {Promise<void>}
     */
    private async startChumProtocol(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        isClient: boolean,
        contactShouldBeKnown: boolean,
        remotePersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await this.verifyAndExchangePersonId(
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
        await this.startChum(conn, localPersonId, remotePersonInfo.personId, 'chum', isClient);
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
     * @param {EncryptedConnection} conn - Connection to the peer.
     * @param {SHA256IdHash<Person>} localPersonId - The local person id used to setup the chum
     * @returns {Promise<void>}
     */
    private async startChumOneTimeAuthProtocol_Server(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>
    ): Promise<void> {
        if (!this.anonInstanceInfo) {
            throw new Error('Identities were not initialized correctly.');
        }

        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await this.verifyAndExchangePersonId(conn, localPersonId, false);
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
        const localPersonObj = (await getObjectByIdHash(this.anonInstanceInfo.personId)).obj;
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

        // emit the one_time_auth_success event with the corresponding authentication token
        this.emit('one_time_auth_success', authToken.token);

        // Step 4: Start the chum
        await this.startChum(
            conn,
            localPersonId,
            remotePersonInfo.personId,
            'chum_onetimeauth_withtoken',
            false
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
     * @param {EncryptedConnection} conn - Connection to the peer.
     * @param {SHA256IdHash<Person>} localPersonId - The local person id used to setup the chum
     * @param {string} authenticationToken - The authentication token received via a secure channel from the peer
     * @returns {Promise<void>}
     */
    private async startChumOneTimeAuthProtocol_Client(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        authenticationToken: string
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const personInfo = await this.verifyAndExchangePersonId(conn, localPersonId, true);

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
        const localPersonObj = (await getObjectByIdHash(localPersonId)).obj;
        await ConnectionsModel.sendMessage(conn, {
            command: 'person_object',
            obj: localPersonObj
        });

        // Step 4: Start the chum
        await this.startChum(
            conn,
            localPersonId,
            personInfo.personId,
            'chum_onetimeauth_withtoken',
            true
        );
        conn.close();
    }

    // ################ ONE TIME AUTH PROTOCOL (TAKEOVER) ################

    /**
     * Start a chum by authentication with a one time auth token and the local peer password.
     *
     * This function will not only setup the chum, but it will also transfer the person private keys
     * to the peer, so that he can integrate himself into the internet of me.
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Wait for and verify authentication token by comparing to local list
     * Step 3: Wait for and verify with password encrypted authentication token by using a password derived key for de/encryption
     * Step 4: Send the private data (keys and ids and stuff)
     * Step 5: Setup the chum
     *
     * @param {EncryptedConnection} conn
     * @param {SHA256IdHash<Person>} localPersonId
     * @returns {Promise<void>}
     */
    private async startChumPkExchangeProtocol_Server(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const remotePersonInfo = await this.verifyAndExchangePersonId(
            conn,
            localPersonId,
            false,
            localPersonId, // Since we have created the instance already with the takeover id it should match
            true // Skip key verification, because we have an old key
        );
        // We cannot know the user, so checking for isNew is not necessary

        // Step 2: Wait for the authentication token and verify it against the token list
        const authToken = await ConnectionsModel.waitForMessage(conn, 'authentication_token');

        // Verify the auth token
        const authData = this.pkOneTimeAuthenticationTokens.get(authToken.token);
        if (authData === undefined) {
            throw new Error('Authentication token is not existing.');
        }

        // Verify the received id with the local id used to generate the code
        if (authData.localPersonId !== localPersonId) {
            throw new Error('The authentication token was not generated for the requested person.');
        }

        // Step 3: Wait for encrypted authentication token for verifying the password
        const encAuthData = await ConnectionsModel.waitForMessage(
            conn,
            'encrypted_authentication_token'
        );
        const encryptedAuthTag = toByteArray(encAuthData.token);
        const derivedKey = await scrypt(stringToUint8Array(this.password), authData.salt);

        // Verify if the other instance has the same password as the current instance.
        // We need to remove the "" that is added by Uint8ArrayToString ....
        // TODO: do this smarter! Without conversion and stuff.
        // TODO: think about whether it is a good idea to reuse the authentication token for this stuff
        const decryptedAuthTag = Uint8ArrayToString(
            await decryptWithSymmetricKey(derivedKey, encryptedAuthTag)
            // remove all quotes from the decrypted string
        ).replace(new RegExp('"', 'g'), '');

        // Verify the decrypted auth token
        if (authData.token !== decryptedAuthTag) {
            throw new Error('Decrypted authentication token doe not match.');
        }

        // Step 4: Send private data
        await ConnectionsModel.sendMessage(conn, await this.extractExistingPersonKeys());

        // Done, so remove the one time authentication token from the list
        clearTimeout(authData.expirationTimeoutHandle);
        this.pkOneTimeAuthenticationTokens.delete(authToken.token);

        // emit the one_time_auth_success event with the corresponding authentication token
        this.emit('one_time_auth_success', authToken.token);

        // Step 5: Start the chum
        await this.startChum(
            conn,
            localPersonId,
            remotePersonInfo.personId,
            'chumAndPkExchange_onetimeauth_withtoken',
            false
        );
        conn.close();
    }

    /**
     * Start a chum by authentication with a one time auth token and the remote peer password.
     *
     * This function will not only setup the chum, but it will also receive the person private keys and apply
     * it to this instance, so that it is integrated into the internet of me.
     *
     * Step 1: Verify / exchange the remote person id (and check the keys against the ones stored in the database)
     * Step 2: Send authentication token
     * Step 3: Send encrypted authentication token by using a password derived key for encryption
     * Step 4: Wait for / apply the private data / keys
     * Step 5: Setup the chum with the new identity
     *
     * @param {EncryptedConnection} conn
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {string} authenticationToken
     * @param {Uint8Array} kdfSalt
     * @param {string} password
     * @returns {Promise<void>}
     */
    private async startChumPkExchangeProtocol_Client(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        authenticationToken: string,
        kdfSalt: Uint8Array,
        password: string
    ): Promise<void> {
        // Step 1: Exchange / authenticate person keys & person Id
        const personInfo = await this.verifyAndExchangePersonId(
            conn,
            localPersonId,
            true,
            localPersonId, // Since we have created the instance already with the takeover id it should match
            true // Skip key verification, because we have an old key
        );

        // Step 2: Send the authentication token
        await ConnectionsModel.sendMessage(conn, {
            command: 'authentication_token',
            token: authenticationToken
        });

        // Step 3: Authenticate by sending the token
        const derivedKey = await scrypt(stringToUint8Array(password), kdfSalt);
        const encryptedAuthTag = await encryptWithSymmetricKey(derivedKey, authenticationToken);
        await ConnectionsModel.sendMessage(conn, {
            command: 'encrypted_authentication_token',
            token: fromByteArray(encryptedAuthTag)
        });

        // Step 4: Wait for the private keys and then takeover the instance
        const privatePersonInfo = await ConnectionsModel.waitForMessage(
            conn,
            'private_person_information'
        );
        await this.overwriteExistingPersonKeys(privatePersonInfo);

        // Step 5: Start the chum with the new id
        await this.startChum(
            conn,
            localPersonId,
            personInfo.personId,
            'chumAndPkExchange_onetimeauth_withtoken',
            true
        );
        conn.close();
    }

    // ################ Others ################

    /**
     * Starts the corresponding chum connection.
     *
     * @param {EncryptedConnection} conn
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {SHA256IdHash<Person>} remotePersonId
     * @param {CommunicationInitiationProtocol.Protocols} protocol
     * @param {boolean} initiatedLocally
     * @returns {Promise<void>}
     */
    private async startChum(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        protocol: CommunicationInitiationProtocol.Protocols,
        initiatedLocally: boolean
    ): Promise<void> {
        this.emit('chum_start', localPersonId, remotePersonId, protocol, initiatedLocally);

        // Send synchronisation messages to make sure both instances start the chum at the same time.
        if (initiatedLocally) {
            await conn.sendMessage('synchronisation');
            await conn.waitForMessage();
        } else {
            await conn.waitForMessage();
            await conn.sendMessage('synchronisation');
        }

        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        // Core takes either the ws package or the default websocket
        // depending on for what environment it was compiled. In this
        // project we use the isomorphic-ws library for this. This is
        // why we need to ignore the below error, because after compilation
        // the types of the websockets will be the same.
        const websocketPromisifierAPI = createWebsocketPromisifier(
            minimalWriteStorageApiObj,
            // @ts-ignore
            conn
        );
        websocketPromisifierAPI.remotePersonIdHash = remotePersonId;
        websocketPromisifierAPI.localPersonIdHash = localPersonId;

        // Start the chum
        await createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            {
                connection: websocketPromisifierAPI,

                // used only for logging purpose
                chumName: 'ConnectionsChum',
                localInstanceName: 'local',
                remoteInstanceName: 'remote',

                keepRunning: true,
                maxNotificationDelay: 20
            }
        );
    }

    /**
     * Extract all private keys public keys and other private information from the current instance.
     *
     * @returns {Promise<CommunicationInitiationProtocol.PrivatePersonInformationMessage>}
     */
    async extractExistingPersonKeys(): Promise<
        CommunicationInitiationProtocol.PrivatePersonInformationMessage
    > {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized.');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('anonInstanceInfo not initialized.');
        }

        const readPrivateKeys = async (filename: string): Promise<string> => {
            return await readUTF8TextFile(filename, 'private');
        };

        // Obtain the main keys
        const mainPersonKeyLink = await getAllValues(this.mainInstanceInfo.personId, true, 'Keys');
        const mainPublicKeys = await getObjectWithType(
            mainPersonKeyLink[mainPersonKeyLink.length - 1].toHash,
            'Keys'
        );
        const mainPrivateEncryptionKey = await readPrivateKeys(
            `${mainPersonKeyLink[mainPersonKeyLink.length - 1].toHash}.owner.encrypt`
        );
        const mainPrivateSignKey = await readPrivateKeys(
            `${mainPersonKeyLink[mainPersonKeyLink.length - 1].toHash}.owner.sign`
        );

        // Obtain the anon keys
        const anonPersonKeyLink = await getAllValues(this.anonInstanceInfo.personId, true, 'Keys');
        const anonPublicKeys = await getObjectWithType(
            anonPersonKeyLink[anonPersonKeyLink.length - 1].toHash,
            'Keys'
        );
        const anonPrivateEncryptionKey = await readPrivateKeys(
            `${anonPersonKeyLink[anonPersonKeyLink.length - 1].toHash}.owner.encrypt`
        );
        const anonPrivateSignKey = await readPrivateKeys(
            `${anonPersonKeyLink[anonPersonKeyLink.length - 1].toHash}.owner.sign`
        );

        // Check for the existence of sign keys
        if (!mainPublicKeys.publicSignKey) {
            throw new Error('Main person does not have a sign key');
        }
        if (!anonPublicKeys.publicSignKey) {
            throw new Error('Anon person does not have a sign key');
        }

        return {
            command: 'private_person_information',
            personId: this.mainInstanceInfo.personId,
            personPublicKey: mainPublicKeys.publicKey,
            personPublicSignKey: mainPublicKeys.publicSignKey,
            personPrivateKey: mainPrivateEncryptionKey,
            personPrivateSignKey: mainPrivateSignKey,
            anonPersonId: this.anonInstanceInfo.personId,
            anonPersonPublicKey: anonPublicKeys.publicKey,
            anonPersonPublicSignKey: anonPublicKeys.publicSignKey,
            anonPersonPrivateKey: anonPrivateEncryptionKey,
            anonPersonPrivateSignKey: anonPrivateSignKey
        };
    }

    /**
     * Overwrites the existing person keys with the received ones - this is
     * required in order for all instances to have the same person keys for the
     * same person object.
     *
     * @param {CommunicationInitiationProtocol.PrivatePersonInformationMessage} privatePersonInformation
     * @returns {Promise<void>}
     */
    async overwriteExistingPersonKeys(
        privatePersonInformation: CommunicationInitiationProtocol.PrivatePersonInformationMessage
    ): Promise<void> {
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized.');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('anonInstanceInfo not initialized.');
        }

        const overwritePrivateKeys = async (
            encryptedBase64Key: string,
            filename: string
        ): Promise<void> => {
            await writeUTF8TextFile(encryptedBase64Key, filename, 'private');
        };

        if (
            this.mainInstanceInfo.personId !== privatePersonInformation.personId ||
            this.anonInstanceInfo.personId !== privatePersonInformation.anonPersonId
        ) {
            throw new Error('Users not match from one instance to the other!');
        }

        // Save the public keys of main id
        const savedOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Keys',
                owner: privatePersonInformation.personId,
                publicKey: privatePersonInformation.personPublicKey,
                publicSignKey: privatePersonInformation.personPublicSignKey
            }
        );
        await overwritePrivateKeys(
            privatePersonInformation.personPrivateKey,
            `${savedOwnerKeys.hash}.owner.encrypt`
        );
        await overwritePrivateKeys(
            privatePersonInformation.personPrivateSignKey,
            `${savedOwnerKeys.hash}.owner.sign`
        );

        // Save the keys of the anonymous id
        const savedAnonOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Keys',
                owner: privatePersonInformation.anonPersonId,
                publicKey: privatePersonInformation.anonPersonPublicKey,
                publicSignKey: privatePersonInformation.anonPersonPublicSignKey
            }
        );
        await overwritePrivateKeys(
            privatePersonInformation.anonPersonPrivateKey,
            `${savedAnonOwnerKeys.hash}.owner.encrypt`
        );
        await overwritePrivateKeys(
            privatePersonInformation.anonPersonPrivateSignKey,
            `${savedAnonOwnerKeys.hash}.owner.sign`
        );

        await overwritePersonKeys(
            this.password,
            this.mainInstanceInfo.personId,
            this.mainInstanceInfo.instanceId
        );
        await overwritePersonKeys(
            this.password,
            this.anonInstanceInfo.personId,
            this.anonInstanceInfo.instanceId
        );
    }

    // ######## Update internal state functions #######

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
                if (instanceInfo.isMain) {
                    this.mainInstanceInfo = instanceInfo;
                } else {
                    this.anonInstanceInfo = instanceInfo;
                }
            })
        );
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
     * @param {EncryptedConnection} conn - The connection used to exchange this data
     * @param {SHA256IdHash<Person>} localPersonId - The local person id (used for getting keys)
     * @param {boolean} initiatedLocally
     * @param {SHA256IdHash<Person>} matchRemotePersonId - It is verified that the transmitted person id matches this one.
     * @param {boolean} skipLocalKeyCompare - Skips the comparision of local keys. Defaults to false. Use with care!
     * @returns {Promise<{isNew: boolean; personId: SHA256IdHash<Person>; personPublicKey: Uint8Array}>}
     */
    private async verifyAndExchangePersonId(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean,
        matchRemotePersonId?: SHA256IdHash<Person>,
        skipLocalKeyCompare?: boolean
    ): Promise<{
        isNew: boolean;
        personId: SHA256IdHash<Person>;
        personPublicKey: Uint8Array;
    }> {
        // Initialize the crypto stuff
        const instanceHash = await this.instancesModel.localInstanceIdForPerson(localPersonId);
        const crypto = createCrypto(instanceHash);

        // Get my own person key
        const localPersonKeyReverse = await getAllValues(localPersonId, true, 'Keys');
        const localPersonKey = (
            await getObjectWithType(
                localPersonKeyReverse[localPersonKeyReverse.length - 1].toHash,
                'Keys'
            )
        ).publicKey;

        // Exchange and challenge response the person keys
        let remotePersonId: SHA256IdHash<Person>;
        let remotePersonKey: Uint8Array;
        if (initiatedLocally) {
            // Step1: Send my person information
            await ConnectionsModel.sendMessage(conn, {
                command: 'person_information',
                personId: localPersonId,
                personPublicKey: localPersonKey
            });

            // Step 2: Wait for remote information
            const remotePersonInfo = await ConnectionsModel.waitForMessage(
                conn,
                'person_information'
            );
            remotePersonId = remotePersonInfo.personId;
            remotePersonKey = toByteArray(remotePersonInfo.personPublicKey);

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
            remotePersonKey = toByteArray(remotePersonInfo.personPublicKey);

            // Step2: Send my person information
            await ConnectionsModel.sendMessage(conn, {
                command: 'person_information',
                personId: localPersonId,
                personPublicKey: localPersonKey
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
            // Lookup key objects of the person he claims to be
            const remotePersonKeyReverse = await getAllValues(remotePersonId, true, 'Keys');
            if (!remotePersonKeyReverse || remotePersonKeyReverse.length === 0) {
                // This means that we have no key belonging to this person
                return {
                    isNew: true,
                    personId: remotePersonId,
                    personPublicKey: remotePersonKey
                };
            }

            // Load the stored key from storage
            const remotePersonKeyStored = (
                await getObjectWithType(
                    remotePersonKeyReverse[remotePersonKeyReverse.length - 1].toHash,
                    'Keys'
                )
            ).publicKey;

            // Compare the key to the transmitted one
            if (fromByteArray(remotePersonKey) === remotePersonKeyStored) {
                keyComparisionFailed = false;
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
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} remotePersonPublicKey
     * @param {CryptoAPI} crypto
     * @returns {Promise<void>}
     */
    private static async challengePersonKey(
        conn: EncryptedConnection,
        remotePersonPublicKey: Uint8Array,
        crypto: CryptoAPI
    ): Promise<void> {
        // Send the challenge
        const challenge = tweetnacl.randomBytes(64);
        const encryptedChallenge = crypto.encryptWithPersonPublicKey(
            remotePersonPublicKey,
            challenge
        );
        await conn.sendBinaryMessage(encryptedChallenge);
        for (let elem of challenge) {
            elem = ~elem;
        }

        // Wait for response
        const encryptedResponse = await conn.waitForBinaryMessage();
        const response = crypto.decryptWithPersonPublicKey(
            remotePersonPublicKey,
            encryptedResponse
        );
        if (!tweetnacl.verify(challenge, response)) {
            conn.close();
            throw new Error('Failed to authenticate connection.');
        }
    }

    /**
     * Wait for a challenge and prove that we have the private key.
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} remotePersonPublicKey
     * @param {CryptoAPI} crypto
     * @returns {Promise<void>}
     */
    private static async challengeRespondPersonKey(
        conn: EncryptedConnection,
        remotePersonPublicKey: Uint8Array,
        crypto: CryptoAPI
    ): Promise<void> {
        // Wait for challenge
        const encryptedChallenge = await conn.waitForBinaryMessage();
        const challenge = crypto.decryptWithPersonPublicKey(
            remotePersonPublicKey,
            encryptedChallenge
        );
        for (let elem of challenge) {
            elem = ~elem;
        }
        const encryptedResponse = crypto.encryptWithPersonPublicKey(
            remotePersonPublicKey,
            challenge
        );
        await conn.sendBinaryMessage(encryptedResponse);
    }

    // ######## Low level io functions (should probably part of a class??? #######

    /**
     * Send a peer message
     *
     * @param {EncryptedConnection} conn
     * @param {T} message - The message to send
     * @returns {Promise<void>}
     */
    private static async sendMessage<T extends CommunicationInitiationProtocol.PeerMessageTypes>(
        conn: EncryptedConnection,
        message: T
    ): Promise<void> {
        await conn.sendMessage(JSON.stringify(message));
    }

    /**
     * Wait for a peer message
     *
     * @param {EncryptedConnection} conn
     * @param {T} command - the command to wait for
     * @returns {Promise<CommunicationInitiationProtocol.ClientMessages[T]>}
     */
    public static async waitForMessage<
        T extends keyof CommunicationInitiationProtocol.PeerMessages
    >(
        conn: EncryptedConnection,
        command: T
    ): Promise<CommunicationInitiationProtocol.PeerMessages[T]> {
        const message = await conn.waitForJSONMessageWithType(command, 'command');
        if (isPeerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }
}

export default ConnectionsModel;
