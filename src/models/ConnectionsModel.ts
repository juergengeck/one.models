import EventEmitter from 'events';
import CommunicationModule from '../misc/CommunicationModule';
import ContactModel from './ContactModel';
import InstancesModel from './InstancesModel';
import EncryptedConnection from '../misc/EncryptedConnection';
import {ChumSyncOptions} from 'one.core/lib/chum-sync';
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {createSingleObjectThroughImpurePlan, WriteStorageApi} from 'one.core/lib/storage';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {createCrypto, CryptoAPI} from 'one.core/lib/instance-crypto';
import OutgoingConnectionEstablisher from '../misc/OutgoingConnectionEstablisher';
import {toByteArray} from 'base64-js';
import {Keys, Person, SHA256IdHash} from '@OneCoreTypes';

export interface PairingInformation {
    authenticationTag: string;
    publicKeyLocal: string;
    takeOver: boolean;
}

interface AuthenticationMessage {
    personIdHash: SHA256IdHash<Person>;
    authenticationTag: string;
}

export default class ConnectionsModel extends EventEmitter {
    private readonly commServerUrl: string;
    private readonly contactModel: ContactModel;
    private readonly instanceModel: InstancesModel;
    private communicationModule: CommunicationModule;
    private generatedPairingInformation: PairingInformation[];
    private anonInstanceKeys: Keys;
    private anonCrypto: CryptoAPI;
    private meAnon: SHA256IdHash<Person>;

    constructor(commServerUrl: string, contactModel: ContactModel, instancesModel: InstancesModel) {
        super();
        this.commServerUrl = commServerUrl;
        this.contactModel = contactModel;
        this.instanceModel = instancesModel;
        this.communicationModule = new CommunicationModule(
            commServerUrl,
            contactModel,
            instancesModel
        );
        this.generatedPairingInformation = [];
        this.communicationModule.onKnownConnection = this.onKnownConnection;
        this.communicationModule.onUnknownConnection = this.onUnknownConnection;
        this.anonInstanceKeys = {} as Keys;
        this.anonCrypto = {} as CryptoAPI;
        this.meAnon = '' as SHA256IdHash<Person>;
    }

    async init(): Promise<void> {
        const me = await this.contactModel.myMainIdentity();
        const meAlternates = (await this.contactModel.myIdentities()).filter(id => id !== me);

        if (meAlternates.length !== 1) {
            throw new Error('This applications needs exactly one alternate identity!');
        }
        this.meAnon = meAlternates[0];
        const anonInstance = await this.instanceModel.localInstanceIdForPerson(this.meAnon);
        this.anonInstanceKeys = await this.instanceModel.instanceKeysForPerson(this.meAnon);
        this.anonCrypto = createCrypto(anonInstance);
    }

    async shutdown(): Promise<void> {
        await this.communicationModule.shutdown();
    }

    async onKnownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        remotePersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        // TODO: challenge response for person keys
        await this.startChum(conn, localPersonId, remotePersonId);
    }

    async onUnknownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        localPersonId: SHA256IdHash<Person>,
        initiatedLocally: boolean
    ): Promise<void> {
        const message = await conn.waitForJSONMessage();
        const authenticationTag = JSON.parse(message).authenticationTag;
        const remotePersonId = JSON.parse(message).personIdHash;

        const checkReceivedAuthenticationTag = this.generatedPairingInformation.filter(
            pairingInfo => pairingInfo.authenticationTag === authenticationTag
        );

        if (checkReceivedAuthenticationTag.length === 1) {
            await this.startChum(conn, localPersonId, remotePersonId);
        }
    }

    async connectUsingPairingInformation(pairingInformation: PairingInformation): Promise<void> {
        const oce: OutgoingConnectionEstablisher = new OutgoingConnectionEstablisher();
        let encryptedConnection: EncryptedConnection | undefined = undefined;

        const targetKey = toByteArray(this.anonInstanceKeys.publicKey);
        const sourceKey = toByteArray(pairingInformation.publicKeyLocal);

        return new Promise((resolve, reject) => {
            oce.onConnection = (
                conn: EncryptedConnection,
                localPublicKey: Uint8Array,
                remotePublicKey: Uint8Array
            ) => {
                encryptedConnection = conn;
                resolve();
            };
            setTimeout(() => {
                oce.stop();
                reject(new Error('timeout expired'));
            }, 60000);

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

            if (encryptedConnection) {
                const authenticationMessage: AuthenticationMessage = {
                    authenticationTag: pairingInformation.authenticationTag,
                    personIdHash: this.meAnon
                };

                encryptedConnection.sendMessage(JSON.stringify(authenticationMessage));
            }
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
}
