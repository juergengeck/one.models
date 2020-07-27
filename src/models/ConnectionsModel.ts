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
    getObjectByIdHash,
    getObjectWithType,
    onUnversionedObj,
    onVersionedObj,
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
    stringToUint8Array,
    Uint8ArrayToString
} from 'one.core/lib/instance-crypto';
import OutgoingConnectionEstablisher from '../misc/OutgoingConnectionEstablisher';
import {fromByteArray, toByteArray} from 'base64-js';
import {Keys, Person, SHA256IdHash, VersionedObjectResult} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import tweetnacl from 'tweetnacl';
import CommunicationInitiationProtocol, {
    isPeerMessage
} from '../misc/CommunicationInitiationProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from '../misc/LogUtils';
import AccessModel, {FreedaAccessGroups} from './AccessModel';
import {scrypt} from 'one.core/lib/system/crypto-scrypt';

const MessageBus = createMessageBus('ConnectionsModel');

export interface PairingInformation {
    authenticationTag: string;
    publicKeyLocal: string;
    url: string;
    takeOver: boolean;
    takeOverDetails?: TakeOverInformation;
}

export interface TakeOverInformation {
    nonce: string;
    email: string;
}

interface AuthenticationMessage {
    personIdHash: SHA256IdHash<Person>;
    authenticationTag: string;
    takeOver?: boolean;
}

interface TakeOverMessage {
    encryptedAuthenticationTag: string;
}

export interface Connection {
    remoteInstancePublicKey: string;
    // true if the instance is connected and false if not
    connectionState: boolean;
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
    private anonCrypto: CryptoAPI;
    private meAnon: SHA256IdHash<Person>;
    private meAnnonObj: VersionedObjectResult<Person>;
    private myInstanceKeys: Keys;
    private myCrypto: CryptoAPI;
    private me: SHA256IdHash<Person>;
    private password: string;
    private salt: string;
    private readonly partnerConnections: Connection[];
    private readonly personalCloudConnections: Connection[];
    private myEmail: string;

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
        this.anonCrypto = {} as CryptoAPI;
        this.myInstanceKeys = {} as Keys;
        this.myCrypto = {} as CryptoAPI;
        this.meAnon = '' as SHA256IdHash<Person>;
        this.me = '' as SHA256IdHash<Person>;
        this.meAnnonObj = {} as VersionedObjectResult<Person>;
    }

    async init(): Promise<void> {
        await this.communicationModule.init();

        this.me = await this.contactModel.myMainIdentity();
        this.myEmail = (await getObjectByIdHash(this.me)).obj.email;
        const myInstance = await this.instancesModel.localInstanceIdForPerson(this.me);
        this.myInstanceKeys = await this.instancesModel.instanceKeysForPerson(this.me);
        this.myCrypto = createCrypto(myInstance);

        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== this.me);

        if (meAlternates.length !== 1) {
            throw new Error('This applications needs exactly one alternate identity!');
        }
        this.meAnon = meAlternates[0];
        this.meAnnonObj = await getObjectByIdHash(this.meAnon);
        const anonInstance = await this.instancesModel.localInstanceIdForPerson(this.meAnon);
        this.anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(this.meAnon);
        this.anonCrypto = createCrypto(anonInstance);

        console.log('me:', this.me);
        console.log('myInstanceKeys:', this.myInstanceKeys);

        console.log('anon me:', this.meAnon);
        console.log('anonInstanceKeys:', this.anonInstanceKeys);
    }

    async shutdown(): Promise<void> {
        await this.communicationModule.shutdown();
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

        await this.startChum(conn, localPersonId, remotePersonId);
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
        }

        // For non replicants accept only pairing requests
        else {
            const message = await conn.waitForJSONMessage();
            const authenticationTag = message.authenticationTag;
            const remotePersonId = message.personIdHash;
            const takeOver = message.takeOver;

            const checkReceivedAuthenticationTag = this.generatedPairingInformation.filter(
                pairingInfo => pairingInfo.authenticationTag === authenticationTag
            );

            if (checkReceivedAuthenticationTag.length != 1) {
                throw new Error('Received authentication tag does not match the sent one.');
            }

            const connectionDetails: Connection = {
                remoteInstancePublicKey: fromByteArray(remotePublicKey),
                connectionState: true
            };

            if (takeOver) {
                const message = await conn.waitForJSONMessage();
                const encryptedAuthTag = stringToUint8Array(message.encryptedAuthenticationTag);
                const kdf = await this.keyDerivationFunction(this.salt, this.password);

                // for each connection to personal cloud we need to set up the password and
                // the salt, so the information is kept as short ass possible in memory
                this.password = '';
                this.salt = '';

                const decryptedAuthTag = Uint8ArrayToString(
                    await decryptWithSymmetricKey(kdf, encryptedAuthTag)
                );

                const checkReceivedAuthenticationTag = this.generatedPairingInformation.filter(
                    pairingInfo => pairingInfo.authenticationTag === decryptedAuthTag
                );

                if (checkReceivedAuthenticationTag.length != 1) {
                    throw new Error(
                        'Received authentication tag for take over does not match the sent one.'
                    );
                }

                this.personalCloudConnections.push(connectionDetails);
                this.emit('authenticatedPersonalCloudDevice');
            } else {
                this.partnerConnections.push(connectionDetails);
                this.emit('authenticatedPartnerDevice');
            }

            await conn.sendMessage(JSON.stringify(this.meAnnonObj.obj));
            const personObj = await conn.waitForJSONMessage();
            console.log('message received:', personObj);
            if (personObj.$type$ === 'Person') {
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    personObj
                );
            }

            await this.startChum(conn, localPersonId, remotePersonId);

            connectionDetails.connectionState = false;
        }
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

        const sourceKey = toByteArray(
            pairingInformation.takeOver
                ? this.myInstanceKeys.publicKey
                : this.anonInstanceKeys.publicKey
        );
        const targetKey = toByteArray(pairingInformation.publicKeyLocal);
        const takeOver = pairingInformation.takeOver;

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
                        const authenticationMessage: AuthenticationMessage = {
                            authenticationTag: pairingInformation.authenticationTag,
                            personIdHash: takeOver ? this.me : this.meAnon
                        };

                        conn.sendMessage(JSON.stringify(authenticationMessage));

                        const connectionDetails: Connection = {
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
                            this.personalCloudConnections.push(connectionDetails);
                            this.emit('authenticatedPersonalCloudDevice');
                        } else {
                            this.partnerConnections.push(connectionDetails);
                            this.emit('authenticatedPartnerDevice');
                        }

                        conn.sendMessage(JSON.stringify(this.meAnnonObj.obj));

                        conn.waitForJSONMessage().then(async personObj => {
                            console.log('message received:', personObj);
                            if (personObj.$type$ === 'Person') {
                                await createSingleObjectThroughPurePlan(
                                    {
                                        module: '@one/identity',
                                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                                    },
                                    personObj
                                );

                                this.communicationModule.addNewUnknownConnection(
                                    localPublicKey,
                                    remotePublicKey,
                                    conn
                                );

                                setTimeout(() => {
                                    this.startChum(
                                        conn,
                                        takeOver ? this.me : this.meAnon,
                                        personInfo.personId
                                    ).then(() => {
                                        connectionDetails.connectionState = false;
                                    });
                                }, 1000);

                                clearTimeout(timeoutHandle);
                                oce.stop();
                                resolve();
                            }
                        });
                    })
                    .catch(e => {
                        clearTimeout(timeoutHandle);
                        oce.stop();
                        conn.close(e.toString());
                        reject(e);
                    });
            };

            oce.start(
                this.commServerUrl,
                sourceKey,
                targetKey,
                text => {
                    return pairingInformation.takeOver
                        ? this.myCrypto.encryptWithInstancePublicKey(targetKey, text)
                        : this.anonCrypto.encryptWithInstancePublicKey(targetKey, text);
                },
                cypherText => {
                    return pairingInformation.takeOver
                        ? this.myCrypto.decryptWithInstancePublicKey(targetKey, cypherText)
                        : this.anonCrypto.decryptWithInstancePublicKey(targetKey, cypherText);
                }
            );
        });
    }

    async startChum(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>
    ): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        const websocketPromisifierAPI = createWebsocketPromisifier(minimalWriteStorageApiObj, conn);
        websocketPromisifierAPI.remotePersonIdHash = remotePersonId;
        websocketPromisifierAPI.localPersonIdHash = localPersonId;

        await this.accessModel.addPersonToAccessGroup(FreedaAccessGroups.partner, remotePersonId);

        const defaultInitialChumObj: ChumSyncOptions = {
            connection: websocketPromisifierAPI,

            // used only for logging purpose
            chumName: 'ConnectionsChum',
            localInstanceName: 'local',
            remoteInstanceName: 'remote',

            keepRunning: true,
            maxNotificationDelay: 20
        };

        console.log('defaultInitialChumObj:', defaultInitialChumObj);

        onVersionedObj.addListener(caughtObject => {
            console.log('versioned object:', caughtObject);
        });

        onUnversionedObj.addListener(caughtObject => {
            console.log('unversioned object:', caughtObject);
        });

        const chum = createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            defaultInitialChumObj
        );

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
                      email: this.myEmail
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
            encryptedAuthenticationTag: Uint8ArrayToString(encryptedAuthTag)
        };

        await conn.sendMessage(JSON.stringify(takeOverMessage));
    }

    getPartnerConnections(): Connection[] {
        return this.partnerConnections;
    }

    getPersonalCloudConnections(): Connection[] {
        return this.personalCloudConnections;
    }
}
