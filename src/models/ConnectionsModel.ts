import EventEmitter from 'events';
import CommunicationModule from '../misc/CommunicationModule';
import ContactModel from './ContactModel';
import InstancesModel from './InstancesModel';
import EncryptedConnection from '../misc/EncryptedConnection';
import {ChumSyncOptions} from 'one.core/lib/chum-sync';
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType,
    SET_ACCESS_MODE,
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
import {
    Keys,
    Person,
    SHA256IdHash,
    VersionedObjectResult,
    ConnectionDetails,
    PairingInformation,
    SHA256Hash,
    Instance
} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import tweetnacl from 'tweetnacl';
import CommunicationInitiationProtocol, {
    isPeerMessage
} from '../misc/CommunicationInitiationProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from '../misc/LogUtils';
import AccessModel, {FreedaAccessGroups} from './AccessModel';
import {scrypt} from 'one.core/lib/system/crypto-scrypt';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {readUTF8TextFile, writeUTF8TextFile} from 'one.core/lib/system/storage-base';

const MessageBus = createMessageBus('ConnectionsModel');

interface AuthenticationMessage {
    personIdHash: SHA256IdHash<Person>;
    authenticationTag: string;
    takeOver?: boolean;
}

interface TakeOverMessage {
    encryptedAuthenticationTag: string;
}

interface AcknowledgeTakeOverMessage {
    acknowledge: boolean;
}

interface ExchangeOwnerKeys {
    ownerId: SHA256IdHash<Person>;
    publicKeys: Keys;
    privateEncryptionKeys: string;
    privateSignKeys: string;
    anonymousOwnerId: SHA256IdHash<Person>;
    anonymousPublicKeys: Keys;
    anonymousPrivateEncryptionKeys: string;
    anonymousPrivateSignKeys: string;
}

export default class ConnectionsModel extends EventEmitter {
    private readonly commServerUrl: string;
    private readonly contactModel: ContactModel;
    private readonly instancesModel: InstancesModel;
    private readonly accessModel: AccessModel;
    private communicationModule: CommunicationModule;
    private generatedPairingInformation: PairingInformation[];
    private readonly isReplicant: boolean;
    private anonInstanceKeys: Keys;
    private meAnon: SHA256IdHash<Person>;
    private meAnnonObj: VersionedObjectResult<Person>;
    private myInstanceKeys: Keys;
    private me: SHA256IdHash<Person>;
    private password: string;
    private salt: string;
    private partnerConnections: ConnectionDetails[];
    private personalCloudConnections: ConnectionDetails[];
    private myEmail: string;
    private partnerAccess: SHA256IdHash<Person>[];
    private myInstance: SHA256IdHash<Instance>;
    private anonInstance: SHA256IdHash<Instance>;
    private readonly openedConnections: EncryptedConnection[];
    private readonly chumTimeout: number;

    constructor(
        commServerUrl: string,
        contactModel: ContactModel,
        instancesModel: InstancesModel,
        accessModel: AccessModel,
        isReplicant: boolean = false
    ) {
        super();
        this.password = '';
        this.salt = '';
        this.myEmail = '';
        this.partnerConnections = [];
        this.personalCloudConnections = [];
        this.commServerUrl = commServerUrl;
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
        this.accessModel = accessModel;
        this.communicationModule = new CommunicationModule(
            commServerUrl,
            contactModel,
            instancesModel
        );
        this.generatedPairingInformation = [];
        this.communicationModule.onKnownConnection = this.onKnownConnection.bind(this);
        this.communicationModule.onUnknownConnection = this.onUnknownConnection.bind(this);
        this.isReplicant = isReplicant;
        this.anonInstanceKeys = {} as Keys;
        this.myInstanceKeys = {} as Keys;
        this.meAnon = '' as SHA256IdHash<Person>;
        this.me = '' as SHA256IdHash<Person>;
        this.meAnnonObj = {} as VersionedObjectResult<Person>;
        this.partnerAccess = [];
        this.myInstance = '' as SHA256IdHash<Instance>;
        this.anonInstance = '' as SHA256IdHash<Instance>;
        this.openedConnections = [];
        this.chumTimeout = 1000;
    }

    async init(): Promise<void> {
        await this.communicationModule.init();

        this.me = await this.contactModel.myMainIdentity();
        this.myEmail = (await getObjectByIdHash(this.me)).obj.email;
        this.myInstance = await this.instancesModel.localInstanceIdForPerson(this.me);
        this.myInstanceKeys = await this.instancesModel.instanceKeysForPerson(this.me);

        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== this.me);

        if (meAlternates.length !== 1) {
            throw new Error('This applications needs exactly one alternate identity!');
        }
        this.meAnon = meAlternates[0];
        this.meAnnonObj = await getObjectByIdHash(this.meAnon);
        this.anonInstance = await this.instancesModel.localInstanceIdForPerson(this.meAnon);
        this.anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(this.meAnon);
        this.personalCloudConnections = [];
        this.partnerConnections = [];

        try {
            // Get previous connection that my instance had.
            const availableConnections = (
                await getObjectByIdObj({
                    $type$: 'AvailableConnections',
                    instanceIdHash: this.myInstance
                })
            ).obj;

            if (availableConnections.personalCloudConnections) {
                this.personalCloudConnections.push(
                    ...(await Promise.all(
                        availableConnections.personalCloudConnections.map(
                            async hash => await getObject(hash)
                        )
                    ))
                );
            }

            if (availableConnections.partnerContacts) {
                this.partnerConnections.push(
                    ...(await Promise.all(
                        availableConnections.partnerContacts.map(
                            async hash => await getObject(hash)
                        )
                    ))
                );
            }
        } catch (error) {
            if (error.name !== 'FileNotFoundError') {
                throw error;
            }
        }
    }

    /**
     * Close all web socket connections and change connection state to disconnected.
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        await this.communicationModule.shutdown();

        for (const conn of this.openedConnections) {
            conn.close();
        }

        for (const connection of this.personalCloudConnections) {
            connection.connectionState = false;
        }

        for (const connection of this.partnerConnections) {
            connection.connectionState = false;
        }

        await this.saveAvailableConnectionsList();
    }

    setPassword(password: string) {
        this.password = password;
    }

    /**
     * This function is called whenever a connection with a known instance was established
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {SHA256IdHash<Person>} remotePersonId2
     * @param {boolean} initiatedLocally
     * @returns {Promise<void>}
     */
    async onKnownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId2: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(conn.webSocket)}: onKnownConnection()`);

        let remotePersonId: SHA256IdHash<Person>;
        let isNew: boolean;
        try {
            const remotePersonInfo = await this.verifyAndExchangePersonId(
                conn,
                localPersonId,
                initiatedLocally,
                false,
                remotePersonId2
            );
            remotePersonId = remotePersonInfo.personId;
            isNew = remotePersonInfo.isNew;
        } catch (e) {
            conn.close(e.toString());
            return;
        }

        // This should always be false, but ....
        if (isNew) {
            conn.close('You are not known. This should not happen, but ... it did.');
            return;
        }

        const connectionDetails: ConnectionDetails = {
            $type$: 'ConnectionDetails',
            remoteInstancePublicKey: fromByteArray(remotePublicKey),
            connectionState: true
        };

        const takeOver = localPersonId === remotePersonId;

        if (takeOver) {
            this.personalCloudConnections.push(connectionDetails);
            this.personalCloudConnections = [...new Set(this.personalCloudConnections)];
            this.emit('authenticatedPersonalCloudDevice');
        } else {
            this.partnerConnections.push(connectionDetails);
            this.partnerConnections = [...new Set(this.partnerConnections)];
            this.emit('authenticatedPartnerDevice');
        }

        await this.startChum(conn, localPersonId, remotePersonId);
        connectionDetails.connectionState = false;
        await this.saveAvailableConnectionsList();

        takeOver
            ? this.emit('authenticatedPersonalCloudDevice')
            : this.emit('authenticatedPartnerDevice');
    }

    /**
     * This function is called whenever a connection with an unknown instance was established
     *
     * @param {EncryptedConnection} conn
     * @param {Uint8Array} localPublicKey
     * @param {Uint8Array} remotePublicKey
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {boolean} initiatedLocally
     * @param {SHA256IdHash<Person>} remotePersonId2
     * @returns {Promise<void>}
     */
    async onUnknownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean,
        remotePersonId2?: SHA256IdHash<Person>
    ): Promise<void> {
        MessageBus.send('log', `${wslogId(conn.webSocket)}: onUnknownConnection()`);

        let remotePersonId: SHA256IdHash<Person>;
        try {
            const remotePersonInfo = await this.verifyAndExchangePersonId(
                conn,
                localPersonId,
                initiatedLocally,
                false,
                remotePersonId2
            );
            remotePersonId = remotePersonInfo.personId;
        } catch (e) {
            conn.close(e.toString());
            return;
        }

        // For replicant, just accept everything
        if (this.isReplicant) {
            await this.startChum(conn, localPersonId, remotePersonId);
            return;
        }

        // For non replicants accept only pairing requests
        // Wait for authentication message.
        const message = await conn.waitForJSONMessage();
        const authenticationTag = message.authenticationTag;
        remotePersonId = message.personIdHash;
        const takeOver = message.takeOver;

        // Check if the received authentication tag corresponds with a generated one.
        const checkReceivedAuthenticationTag = this.generatedPairingInformation.filter(
            pairingInfo => pairingInfo.authenticationTag === authenticationTag
        );

        if (checkReceivedAuthenticationTag.length != 1) {
            throw new Error('Received authentication tag does not match the sent one.');
        }

        const connectionDetails: ConnectionDetails = {
            $type$: 'ConnectionDetails',
            remoteInstancePublicKey: fromByteArray(remotePublicKey),
            connectionState: true
        };

        let timeout = 0;

        if (takeOver) {
            // In takeOver process the timeout is required in order for the other
            // instance to have time to register it's services for chums, before
            // this instance sends the corresponding messages.
            timeout = this.chumTimeout;

            const message = await conn.waitForJSONMessage();
            const encryptedAuthTag = toByteArray(message.encryptedAuthenticationTag);
            const kdf = await this.keyDerivationFunction(this.salt, this.password);

            // Verify if the other instance has the same password as the current instance.
            const decryptedAuthTag = Uint8ArrayToString(
                await decryptWithSymmetricKey(kdf, encryptedAuthTag)
                // remove all quotes from the decrypted string
            ).replace(new RegExp('"', 'g'), '');

            let found = false;
            this.generatedPairingInformation.forEach(pairingInfo => {
                if (pairingInfo.authenticationTag === decryptedAuthTag) {
                    found = true;
                }
            });

            const acknowledgeTakeOverMessage: AcknowledgeTakeOverMessage = {
                acknowledge: false
            };

            if (found) {
                // send acknowledge message
                acknowledgeTakeOverMessage.acknowledge = true;
                await conn.sendMessage(JSON.stringify(acknowledgeTakeOverMessage));
                // Send the person keys in order to overwrite them in the other instance.
                // At the end all instances will have the same keys for the same person.
                await this.sendOwnerKeys(conn);

                this.personalCloudConnections.push(connectionDetails);
                this.personalCloudConnections = [...new Set(this.personalCloudConnections)];
                this.emit('authenticatedPersonalCloudDevice');
            } else {
                // send error message
                acknowledgeTakeOverMessage.acknowledge = true;
                await conn.sendMessage(JSON.stringify(acknowledgeTakeOverMessage));
                throw new Error(
                    'Received authentication tag for take over does not match the sent one.'
                );
            }
        } else {
            // partner connection
            this.partnerConnections.push(connectionDetails);
            this.partnerConnections = [...new Set(this.partnerConnections)];
            this.emit('authenticatedPartnerDevice');

            // Exchange person object - required for giving access using groups.
            await conn.sendMessage(JSON.stringify(this.meAnnonObj.obj));
            const personObj = await conn.waitForJSONMessage();
            if (personObj.$type$ === 'Person') {
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    personObj
                );
            }
        }
        setTimeout(async () => {
            await this.startChum(conn, localPersonId, remotePersonId);
            // when the chum is returned, the connection is closed
            connectionDetails.connectionState = false;
            await this.saveAvailableConnectionsList();

            takeOver
                ? this.emit('authenticatedPersonalCloudDevice')
                : this.emit('authenticatedPartnerDevice');
        }, timeout);
    }

    /**
     * This process exchanges and verifies person keys.
     *
     * @param {EncryptedConnection} conn - The connection used to exchange this data
     * @param {SHA256IdHash<Person>} localPersonId - The local person id (used for getting keys)
     * @param {boolean} initiatedLocally
     * @param {boolean} takeOver
     * @param {SHA256IdHash<Person>} remotePersonId2 - It is verified that the transmitted person id matches this one.
     * @returns {Promise<{isNew: boolean; personId: SHA256IdHash<Person>; personPublicKey: Uint8Array}>}
     */
    private async verifyAndExchangePersonId(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean,
        takeOver: boolean = false,
        remotePersonId2?: SHA256IdHash<Person>
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
        const localPersonKey = (await getObjectWithType(localPersonKeyReverse[0].toHash, 'Keys'))
            .publicKey;

        // Exchange and challenge response the person keys
        let remotePersonId: SHA256IdHash<Person>;
        let remotePersonKey: Uint8Array;
        if (initiatedLocally) {
            // Step1: Send my person information
            await this.sendPersonInformation(conn, localPersonId, localPersonKey, takeOver);

            // Step 2: Wait for remote information
            const remotePersonInfo = await this.waitForMessage(conn, 'person_information');
            remotePersonId = remotePersonInfo.personId as SHA256IdHash<Person>;
            remotePersonKey = toByteArray(remotePersonInfo.personPublicKey);

            // Step 3: Perform challenge / response
            await this.challengePersonKey(conn, remotePersonKey, crypto);

            // Step 4: Answer challenge response
            await this.challengeRespondPersonKey(conn, remotePersonKey, crypto);
        } else {
            // Step 1: Wait for remote information
            const remotePersonInfo = await this.waitForMessage(conn, 'person_information');
            remotePersonId = remotePersonInfo.personId as SHA256IdHash<Person>;
            remotePersonKey = toByteArray(remotePersonInfo.personPublicKey);

            // Step2: Send my person information
            await this.sendPersonInformation(conn, localPersonId, localPersonKey, takeOver);

            // Step 3: Answer challenge response
            await this.challengeRespondPersonKey(conn, remotePersonKey, crypto);

            // Step 4: Perform challenge / response
            await this.challengePersonKey(conn, remotePersonKey, crypto);
        }

        // Verify that the remote person id is the same as the one we have from the callback
        if (remotePersonId2 && remotePersonId !== remotePersonId2) {
            throw new Error('The person id does not match the one we have on record.');
        }

        // Verify that the transmitted key matches the one we already have
        try {
            const remotePersonKeyReverse = await getAllValues(remotePersonId, true, 'Keys');
            const remotePersonKey2 = (
                await getObjectWithType(remotePersonKeyReverse[0].toHash, 'Keys')
            ).publicKey;
            if (fromByteArray(remotePersonKey) !== remotePersonKey2) {
                throw new Error('Key does not match your previous visit');
            }
            return {
                isNew: false,
                personId: remotePersonId,
                personPublicKey: remotePersonKey
            };
        } catch (e) {
            // This means that we have not encountered the person, yet. => ok
            return {
                isNew: true,
                personId: remotePersonId,
                personPublicKey: remotePersonKey
            };
        }
    }

    /**
     * The instance that receives the invitation has to explicitly call the connect function.
     *
     * @param {PairingInformation} pairingInformation
     * @param {string} password
     * @returns {Promise<void>}
     */
    async connectUsingPairingInformation(
        pairingInformation: PairingInformation,
        password: string
    ): Promise<void> {
        const oce: OutgoingConnectionEstablisher = new OutgoingConnectionEstablisher();

        const takeOver = pairingInformation.takeOver;

        // In takeOver process use the normal identity and in other connections ude the anonymous one.
        const sourceKey = toByteArray(
            takeOver ? this.myInstanceKeys.publicKey : this.anonInstanceKeys.publicKey
        );
        const targetKey = toByteArray(pairingInformation.publicKeyLocal);

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                oce.stop();
                reject(new Error('timeout expired'));
            }, 60000);

            oce.onConnection = (
                conn: EncryptedConnection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array
            ) => {
                // Person id authentication
                this.verifyAndExchangePersonId(
                    conn,
                    takeOver ? this.me : this.meAnon,
                    true,
                    takeOver
                )
                    .then(personInfo => {
                        // Send the received authentication tag for the other instance
                        // to check if it corresponds with the one that was generated.
                        const authenticationMessage: AuthenticationMessage = {
                            authenticationTag: pairingInformation.authenticationTag,
                            personIdHash: takeOver ? this.me : this.meAnon,
                            takeOver: takeOver
                        };

                        conn.sendMessage(JSON.stringify(authenticationMessage));

                        const connectionDetails: ConnectionDetails = {
                            $type$: 'ConnectionDetails',
                            remoteInstancePublicKey: fromByteArray(remotePublicKey),
                            connectionState: true
                        };

                        if (pairingInformation.takeOver && pairingInformation.takeOverDetails) {
                            this.sendTakeOverInformation(
                                conn,
                                pairingInformation.takeOverDetails.nonce,
                                password,
                                pairingInformation.authenticationTag
                            );

                            conn.waitForJSONMessage().then(
                                async (acknowledgeMessage: AcknowledgeTakeOverMessage) => {
                                    if (acknowledgeMessage.acknowledge) {
                                        const exchangeOwnerKeys: ExchangeOwnerKeys = await conn.waitForJSONMessage();
                                        await this.overwriteExistingPersonKeys(exchangeOwnerKeys);

                                        this.personalCloudConnections.push(connectionDetails);
                                        this.personalCloudConnections = [
                                            ...new Set(this.personalCloudConnections)
                                        ];
                                        this.emit('authenticatedPersonalCloudDevice');

                                        // Add the connection to the unknown list, so when the contact object is
                                        // received the connection to be moved in the known connections list.
                                        this.communicationModule.addNewUnknownConnection(
                                            localPublicKey,
                                            remotePublicKey,
                                            conn
                                        );

                                        this.startChum(conn, this.me, personInfo.personId).then(
                                            async () => {
                                                connectionDetails.connectionState = false;
                                                await this.saveAvailableConnectionsList();
                                                this.emit('authenticatedPersonalCloudDevice');
                                            }
                                        );
                                    } else {
                                        throw new Error('Wrong password!');
                                    }

                                    clearTimeout(timeoutHandle);
                                    await oce.stop();
                                    resolve();
                                }
                            );
                        } else {
                            this.partnerConnections.push(connectionDetails);
                            this.partnerConnections = [...new Set(this.partnerConnections)];
                            this.emit('authenticatedPartnerDevice');

                            // Exchange person object in order to give access using groups.
                            conn.waitForJSONMessage().then(async personObj => {
                                if (personObj.$type$ === 'Person') {
                                    await createSingleObjectThroughPurePlan(
                                        {
                                            module: '@one/identity',
                                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                                        },
                                        personObj
                                    );

                                    await conn.sendMessage(JSON.stringify(this.meAnnonObj.obj));

                                    // Add the connection to the unknown list, so when the contact object is
                                    // received the connection to be moved in the known connections list.
                                    this.communicationModule.addNewUnknownConnection(
                                        localPublicKey,
                                        remotePublicKey,
                                        conn
                                    );

                                    // The other instance need time to memorize the received Person
                                    // object, this is the reason for the timeout.
                                    setTimeout(() => {
                                        this.startChum(conn, this.meAnon, personInfo.personId).then(
                                            async () => {
                                                connectionDetails.connectionState = false;
                                                await this.saveAvailableConnectionsList();
                                                this.emit('authenticatedPartnerDevice');
                                            }
                                        );
                                    }, this.chumTimeout);

                                    clearTimeout(timeoutHandle);
                                    await oce.stop();
                                    resolve();
                                }
                            });
                        }
                    })
                    .catch(e => {
                        clearTimeout(timeoutHandle);
                        oce.stop();
                        conn.close(e.toString());
                        reject(e);
                    });
            };

            // In takeOver process use normal identity and in partner connection use anonymous one.
            const crypto = createCrypto(takeOver ? this.myInstance : this.anonInstance);

            oce.start(
                this.commServerUrl,
                sourceKey,
                targetKey,
                text => {
                    return crypto.encryptWithInstancePublicKey(targetKey, text);
                },
                cypherText => {
                    return crypto.decryptWithInstancePublicKey(targetKey, cypherText);
                }
            );
        });
    }

    /**
     * Starts the corresponding chum connection.
     *
     * @param {EncryptedConnection} conn
     * @param {SHA256IdHash<Person>} localPersonId
     * @param {SHA256IdHash<Person>} remotePersonId
     * @returns {Promise<void>}
     */
    async startChum(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>
    ): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;
        // Core takes either the ws package or the default websocket
        // depending on for what environment it was compiled. In this
        // project we use the isomorphic-ws library for this. This is
        // why we need to ignore the below error, because after compilation
        // the types of the websockets will be the same.
        // @ts-ignore
        const websocketPromisifierAPI = createWebsocketPromisifier(minimalWriteStorageApiObj, conn);
        websocketPromisifierAPI.remotePersonIdHash = remotePersonId;
        websocketPromisifierAPI.localPersonIdHash = localPersonId;

        console.log('local person id:', localPersonId);
        console.log('remote person id:', remotePersonId);
        console.log('me:', this.me);
        console.log('anon me:', this.meAnon);

        if (localPersonId !== remotePersonId) {
            // For instances that I own the localPersonId and remotePersonID will be the same,
            // so if the id's are different, that means that I am connecting to a partner.
            await this.accessModel.addPersonToAccessGroup(
                FreedaAccessGroups.partner,
                remotePersonId
            );
            await this.giveAccessToPartner(remotePersonId);
        }

        const defaultInitialChumObj: ChumSyncOptions = {
            connection: websocketPromisifierAPI,

            // used only for logging purpose
            chumName: 'ConnectionsChum',
            localInstanceName: 'local',
            remoteInstanceName: 'remote',

            keepRunning: true,
            maxNotificationDelay: 20
        };

        const chum = createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            defaultInitialChumObj
        );

        this.openedConnections.push(conn);

        await this.saveAvailableConnectionsList();
        this.emit('connectionEstablished');
        await chum;
    }

    async generatePairingInformation(takeOver: boolean): Promise<PairingInformation> {
        this.salt = await this.generateSalt();

        const pairingInformation: PairingInformation = {
            authenticationTag: await createRandomString(),
            publicKeyLocal: takeOver
                ? this.myInstanceKeys.publicKey
                : this.anonInstanceKeys.publicKey,
            url: this.commServerUrl,
            takeOver,
            takeOverDetails: takeOver
                ? {
                      nonce: this.salt,
                      email: this.myEmail,
                      anonymousEmail: this.meAnnonObj.obj.email
                  }
                : undefined
        };
        this.generatedPairingInformation.push(pairingInformation);

        return pairingInformation;
    }

    private async sendPersonInformation(
        conn: EncryptedConnection,
        personId: SHA256IdHash<Person>,
        personPublicKey: string,
        takeOver: boolean
    ): Promise<void> {
        await this.sendMessage(conn, {
            command: 'person_information',
            personId: personId,
            personPublicKey: personPublicKey,
            takeOver: takeOver
        });
    }

    /**
     * Send a peer message
     *
     * @param {EncryptedConnection} conn
     * @param {T} message - The message to send
     * @returns {Promise<void>}
     */
    private async sendMessage<T extends CommunicationInitiationProtocol.PeerMessageTypes>(
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
    public async waitForMessage<T extends keyof CommunicationInitiationProtocol.PeerMessages>(
        conn: EncryptedConnection,
        command: T
    ): Promise<CommunicationInitiationProtocol.PeerMessages[T]> {
        const message = await conn.waitForJSONMessageWithType(command, 'command');
        if (isPeerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

    private async challengePersonKey(
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

    private async challengeRespondPersonKey(
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

    private async keyDerivationFunction(
        saltString: string,
        passwordString: string
    ): Promise<Uint8Array> {
        const salt = stringToUint8Array(saltString);
        const password = stringToUint8Array(passwordString);
        return await scrypt(password, salt);
    }

    async generateSalt(): Promise<string> {
        return await createRandomString();
    }

    private async sendTakeOverInformation(
        conn: EncryptedConnection,
        salt: string | undefined,
        password: string,
        authenticationTag: string
    ): Promise<void> {
        if (salt === undefined) {
            throw new Error('The received information do not contain nonce');
        }
        const kdf = await this.keyDerivationFunction(salt, password);
        const encryptedAuthTag = await encryptWithSymmetricKey(kdf, authenticationTag);
        const takeOverMessage: TakeOverMessage = {
            encryptedAuthenticationTag: fromByteArray(encryptedAuthTag)
        };

        await conn.sendMessage(JSON.stringify(takeOverMessage));
    }

    async connectToReplicant(remoteInstanceKey: string): Promise<void> {
        const oce: OutgoingConnectionEstablisher = new OutgoingConnectionEstablisher();

        const sourceKey = toByteArray(this.anonInstanceKeys.publicKey);
        const targetKey = toByteArray(remoteInstanceKey);

        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                oce.stop();
                reject(new Error('timeout expired'));
            }, 60000);

            oce.onConnection = (
                conn: EncryptedConnection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array
            ) => {
                // Person id authentication
                this.verifyAndExchangePersonId(conn, this.meAnon, true, false)
                    .then(async personInfo => {
                        await this.giveAccessToReplicant(personInfo.personId);
                        // the timout is needed so that the other instance has time to register all services
                        setTimeout(() => {
                            this.startChum(conn, this.meAnon, personInfo.personId).then(() => {});
                        }, this.chumTimeout);

                        clearTimeout(timeoutHandle);
                        await oce.stop();
                        resolve();
                    })
                    .catch(e => {
                        clearTimeout(timeoutHandle);
                        oce.stop();
                        conn.close(e.toString());
                        reject(e);
                    });
            };

            const crypto = createCrypto(this.anonInstance);

            oce.start(
                this.commServerUrl,
                sourceKey,
                targetKey,
                text => {
                    return crypto.encryptWithInstancePublicKey(targetKey, text);
                },
                cypherText => {
                    return crypto.decryptWithInstancePublicKey(targetKey, cypherText);
                }
            );
        });
    }

    getPartnerConnections(): ConnectionDetails[] {
        return this.partnerConnections;
    }

    getPersonalCloudConnections(): ConnectionDetails[] {
        return this.personalCloudConnections;
    }

    // todo: just for testing purpose give access directly to the person - should be removed
    async giveAccessToPartner(partnerIdHash: SHA256IdHash<Person>): Promise<void> {
        this.partnerAccess.push(partnerIdHash);

        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'questionnaire',
            owner: this.me
        });
        const setAccessParam = {
            id: channelInfoIdHash,
            person: this.partnerAccess,
            group: [],
            mode: SET_ACCESS_MODE.ADD
        };
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [setAccessParam]
        );
        // share my consent files with partner for backup
        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'consentFile',
            owner: this.me
        });

        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        // share my contacts with partner
        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'contacts',
            owner: this.me
        });

        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        try {
            // share old partner consent files with partner for backup
            setAccessParam.id = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: 'consentFile',
                owner: partnerIdHash
            });

            await getObjectByIdHash(setAccessParam.id);

            await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        } catch (error) {
            // If the partner was not connected with this instance previously,
            // then the calculateIdHashOfObj function will return a FileNotFoundError.
            if (error.name !== 'FileNotFoundError') {
                console.error(error);
            }
        }
    }

    async revokeAccessFromPartner(partnerIdHash: SHA256IdHash<Person>): Promise<void> {
        this.partnerAccess = this.partnerAccess.filter(obj => obj !== partnerIdHash);

        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'questionnaire',
            owner: this.me
        });
        const setAccessParam = {
            id: channelInfoIdHash,
            person: this.partnerAccess,
            group: [],
            mode: SET_ACCESS_MODE.REPLACE
        };
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [setAccessParam]
        );
        // share my consent files with partner for backup
        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'consentFile',
            owner: this.me
        });

        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
    }

    async giveAccessToReplicant(replicantIdHash: SHA256IdHash<Person>): Promise<void> {
        const channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'questionnaire',
            owner: this.me
        });
        const setAccessParam = {
            id: channelInfoIdHash,
            person: [replicantIdHash],
            group: [],
            mode: SET_ACCESS_MODE.REPLACE
        };
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [setAccessParam]
        );

        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'consentFile',
            owner: this.me
        });
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);

        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'feedbackChannel',
            owner: this.me
        });
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        setAccessParam.id = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: 'contacts',
            owner: this.me
        });

        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
    }

    /**
     * Saves the current state of the connections list.
     *
     * @returns {Promise<void>}
     * @private
     */
    private async saveAvailableConnectionsList(): Promise<void> {
        let personalCloudConnectionsHash: SHA256Hash<ConnectionDetails>[] = [];
        let partnerConnectionsHash: SHA256Hash<ConnectionDetails>[] = [];

        personalCloudConnectionsHash = await Promise.all(
            this.personalCloudConnections.map(async connection => {
                return (
                    await createSingleObjectThroughPurePlan(
                        {
                            module: '@one/identity',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        connection
                    )
                ).hash;
            })
        );
        partnerConnectionsHash = await Promise.all(
            this.partnerConnections.map(async connection => {
                return (
                    await createSingleObjectThroughPurePlan(
                        {
                            module: '@one/identity',
                            versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                        },
                        connection
                    )
                ).hash;
            })
        );

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'AvailableConnections',
                instanceIdHash: this.myInstance,
                personalCloudConnections: personalCloudConnectionsHash,
                partnerContacts: partnerConnectionsHash
            }
        );
    }

    async overwritePrivateKeys(encryptedBase64Key: string, filename: string): Promise<void> {
        await writeUTF8TextFile(encryptedBase64Key, filename, 'private');
    }

    async readPrivateKeys(filename: string): Promise<string> {
        return await readUTF8TextFile(filename, 'private');
    }

    /**
     * Gets the person keys (both public and private) and sends them to the other instance.
     *
     * @param {EncryptedConnection} conn
     * @returns {Promise<void>}
     */
    async sendOwnerKeys(conn: EncryptedConnection): Promise<void> {
        const ownerId = this.me;
        const personKeyLink = await getAllValues(this.me, true, 'Keys');
        const publicKeys = await getObjectWithType(
            personKeyLink[personKeyLink.length - 1].toHash,
            'Keys'
        );
        const privateEncryptionKeys = await this.readPrivateKeys(
            `${personKeyLink[personKeyLink.length - 1].toHash}.owner.encrypt`
        );
        const privateSignKeys = await this.readPrivateKeys(
            `${personKeyLink[personKeyLink.length - 1].toHash}.owner.sign`
        );
        const anonymousOwnerId = this.meAnon;
        const anonymousPersonKeyLink = await getAllValues(this.meAnon, true, 'Keys');
        const anonymousPublicKeys = await getObjectWithType(
            anonymousPersonKeyLink[anonymousPersonKeyLink.length - 1].toHash,
            'Keys'
        );
        const anonymousPrivateEncryptionKeys = await this.readPrivateKeys(
            `${anonymousPersonKeyLink[anonymousPersonKeyLink.length - 1].toHash}.owner.encrypt`
        );
        const anonymousPrivateSignKeys = await this.readPrivateKeys(
            `${anonymousPersonKeyLink[anonymousPersonKeyLink.length - 1].toHash}.owner.sign`
        );

        const exchangeOwnerKeys: ExchangeOwnerKeys = {
            ownerId,
            publicKeys,
            privateEncryptionKeys,
            privateSignKeys,
            anonymousOwnerId,
            anonymousPublicKeys,
            anonymousPrivateEncryptionKeys,
            anonymousPrivateSignKeys
        };

        await conn.sendMessage(JSON.stringify(exchangeOwnerKeys));
    }

    /**
     * Receives the person keys from the other instance (both private and public)
     * and overwrites the existing person keys with the received one - this is
     * required in order for all instances to have the same person keys for the
     * same person object.
     *
     * @param {ExchangeOwnerKeys} exchangeOwnerKeys
     * @returns {Promise<void>}
     */
    async overwriteExistingPersonKeys(exchangeOwnerKeys: ExchangeOwnerKeys): Promise<void> {
        if (
            this.me !== exchangeOwnerKeys.ownerId ||
            this.meAnon !== exchangeOwnerKeys.anonymousOwnerId
        ) {
            throw new Error('Users not match from one instance to the other!');
        }
        const savedOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            exchangeOwnerKeys.publicKeys
        );
        await this.overwritePrivateKeys(
            exchangeOwnerKeys.privateEncryptionKeys,
            `${savedOwnerKeys.hash}.owner.encrypt`
        );
        await this.overwritePrivateKeys(
            exchangeOwnerKeys.privateSignKeys,
            `${savedOwnerKeys.hash}.owner.sign`
        );
        const savedAnonOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            exchangeOwnerKeys.anonymousPublicKeys
        );
        await this.overwritePrivateKeys(
            exchangeOwnerKeys.anonymousPrivateEncryptionKeys,
            `${savedAnonOwnerKeys.hash}.owner.encrypt`
        );
        await this.overwritePrivateKeys(
            exchangeOwnerKeys.anonymousPrivateSignKeys,
            `${savedAnonOwnerKeys.hash}.owner.sign`
        );

        await overwritePersonKeys(this.password, this.me, this.myInstance);
    }
}
