import EventEmitter from 'events';
import CommunicationModule from '../misc/CommunicationModule';
import ContactModel from './ContactModel';
import InstancesModel from './InstancesModel';
import EncryptedConnection from '../misc/EncryptedConnection';
import {ChumSyncOptions} from 'one.core/lib/chum-sync';
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {
    createSingleObjectThroughImpurePlan,
    getObjectWithType,
    WriteStorageApi
} from 'one.core/lib/storage';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {createCrypto, CryptoAPI} from 'one.core/lib/instance-crypto';
import OutgoingConnectionEstablisher from '../misc/OutgoingConnectionEstablisher';
import {fromByteArray, toByteArray} from 'base64-js';
import {Keys, Person, SHA256IdHash} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import tweetnacl from 'tweetnacl';
import CommunicationInitiationProtocol, {
    isPeerMessage
} from '../misc/CommunicationInitiationProtocol';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from '../misc/LogUtils';

const MessageBus = createMessageBus('ConnectionsModel');

export interface PairingInformation {
    authenticationTag: string;
    publicKeyLocal: string;
    takeOver: boolean;
    url?: string;
}

interface AuthenticationMessage {
    personIdHash: SHA256IdHash<Person>;
    authenticationTag: string;
    takeOver?: boolean;
}

export default class ConnectionsModel extends EventEmitter {
    private readonly commServerUrl: string;
    private readonly contactModel: ContactModel;
    private readonly instancesModel: InstancesModel;
    private communicationModule: CommunicationModule;
    private generatedPairingInformation: PairingInformation[];
    private isReplicant: boolean;
    private anonInstanceKeys: Keys;
    private anonCrypto: CryptoAPI;
    private meAnon: SHA256IdHash<Person>;

    constructor(
        commServerUrl: string,
        contactModel: ContactModel,
        instancesModel: InstancesModel,
        isReplicant: boolean = false
    ) {
        super();
        this.commServerUrl = commServerUrl;
        this.contactModel = contactModel;
        this.instancesModel = instancesModel;
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
        this.meAnon = '' as SHA256IdHash<Person>;
    }

    async init(): Promise<void> {
        await this.communicationModule.init();

        const me = await this.contactModel.myMainIdentity();
        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== me);

        if (meAlternates.length !== 1) {
            throw new Error('This applications needs exactly one alternate identity!');
        }
        this.meAnon = meAlternates[0];
        const anonInstance = await this.instancesModel.localInstanceIdForPerson(this.meAnon);
        this.anonInstanceKeys = await this.instancesModel.instanceKeysForPerson(this.meAnon);
        this.anonCrypto = createCrypto(anonInstance);
    }

    async shutdown(): Promise<void> {
        await this.communicationModule.shutdown();
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
        //let remotePersonPublicKey: Uint8Array;
        let isNew: boolean;
        try {
            const remotePersonInfo = await this.verifyAndExchangePersonId(
                conn,
                localPersonId,
                initiatedLocally,
                remotePersonId2
            );
            remotePersonId = remotePersonInfo.personId;
            //remotePersonPublicKey = remotePersonInfo.personPublicKey;
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
                remotePersonId2
            );
            remotePersonId = remotePersonInfo.personId;
        } catch (e) {
            conn.close(e.toString());
            return;
        }

        // For replicant, just axxept everything
        if (this.isReplicant) {
            await this.startChum(conn, localPersonId, remotePersonId);
        }

        // For non replicants accept only pairing requests
        else {
            const message = await conn.waitForJSONMessage();
            const authenticationTag = message.authenticationTag;
            const remotePersonId = message.personIdHash;

            // if take over then check password
            // use a new type of message an encrypt/decrypt auth tag

            const checkReceivedAuthenticationTag = this.generatedPairingInformation.filter(
                pairingInfo => pairingInfo.authenticationTag === authenticationTag
            );

            if (checkReceivedAuthenticationTag.length === 1) {
                await this.startChum(conn, localPersonId, remotePersonId);
            }
        }
    }

    /**
     * This process exchanges and verifies person keys.
     *
     * @param {EncryptedConnection} conn - The connection used to exchange this data
     * @param {SHA256IdHash<Person>} localPersonId - The local person id (used for getting keys)
     * @param {boolean} initiatedLocally
     * @param {SHA256IdHash<Person>} remotePersonId2 - It is verified that the transmitted person id matches this one.
     * @returns {Promise<{isNew: boolean; personId: SHA256IdHash<Person>; personPublicKey: Uint8Array}>}
     */
    private async verifyAndExchangePersonId(
        conn: EncryptedConnection,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean,
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
            await this.sendPersonInformation(conn, localPersonId, localPersonKey);

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
            await this.sendPersonInformation(conn, localPersonId, localPersonKey);

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
     * @returns {Promise<void>}
     */
    async connectUsingPairingInformation(pairingInformation: PairingInformation): Promise<void> {
        const oce: OutgoingConnectionEstablisher = new OutgoingConnectionEstablisher();

        const sourceKey = toByteArray(this.anonInstanceKeys.publicKey);
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
                this.verifyAndExchangePersonId(conn, this.meAnon, true)
                    .then(personInfo => {
                        const authenticationMessage: AuthenticationMessage = {
                            authenticationTag: pairingInformation.authenticationTag,
                            personIdHash: this.meAnon
                        };

                        conn.sendMessage(JSON.stringify(authenticationMessage));

                        this.startChum(conn, this.meAnon, personInfo.personId);

                        clearTimeout(timeoutHandle);
                        oce.stop();
                        resolve();
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
                    return this.anonCrypto.encryptWithInstancePublicKey(targetKey, text);
                },
                cypherText => {
                    return this.anonCrypto.decryptWithInstancePublicKey(targetKey, cypherText);
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
            createFileWriteStream
        } as WriteStorageApi;

        const websocketPromisifierAPI = createWebsocketPromisifier(minimalWriteStorageApiObj, conn);
        websocketPromisifierAPI.remotePersonIdHash = remotePersonId;
        websocketPromisifierAPI.localPersonIdHash = localPersonId;

        const defaultInitialChumObj: ChumSyncOptions = {
            connection: websocketPromisifierAPI,

            // used only for logging purpose
            chumName: 'ConnectionsChum',
            localInstanceName: 'local',
            remoteInstanceName: 'remote',

            keepRunning: true,
            maxNotificationDelay: 20
        };

        await createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            defaultInitialChumObj
        );
    }

    async generatePairingInformation(takeOver: boolean): Promise<PairingInformation> {
        const pairingInformation = {
            authenticationTag: await createRandomString(),
            publicKeyRemote: await createRandomString(),
            publicKeyLocal: this.anonInstanceKeys.publicKey,
            takeOver
        };

        this.generatedPairingInformation.push(pairingInformation);

        return pairingInformation;
    }

    private async sendPersonInformation(
        conn: EncryptedConnection,
        personId: SHA256IdHash<Person>,
        personPublicKey: string
    ): Promise<void> {
        await this.sendMessage(conn, {
            command: 'person_information',
            personId: personId,
            personPublicKey: personPublicKey
        });
    }

    /**
     * Send a peer message
     *
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
}
