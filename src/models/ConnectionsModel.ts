import {PairingInformation} from 'one.core/lib/communication-creator';
import EventEmitter from 'events';
import {
    CommunicationManagerAPI,
    createCommunicationManager
} from 'one.core/lib/communication-manager';
import {
    AuthenticatedContact,
    Instance,
    SHA256Hash,
    AuthenticatedContactsList,
    VersionedObjectResult,
    Chum
} from '@OneCoreTypes';
import {ChumSyncOptions} from 'one.core/lib/chum-sync';
import {
    createSingleObjectThroughImpurePlan,
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    SET_ACCESS_MODE,
    SetAccessParam,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {getInstanceIdHash} from 'one.core/lib/instance';
import i18n from '../i18n';
import {calculateHashOfObj, calculateIdHashOfObj} from 'one.core/lib/util/object';

/**
 * All data about an connection are keept in this type.
 */
export type Connection = {
    pairingInformation?: PairingInformation;
    communicationManagerAPI: CommunicationManagerAPI;
    authenticatedContact?: AuthenticatedContact;
    // if the connection is opened, the value will be true, else false
    connectionState: boolean;
    chum?: Promise<VersionedObjectResult<Chum>>;
};

/**
 * The take over case is a bit different from the partner connection, because
 * the generated email will be sent from the instance that generates the QR code
 * to the second instance and also the nonce for generating the kdf will be sent.
 */
export type InformationForTakeOver = {
    pairingInformation: PairingInformation;
    randomEmail: string;
    generatedNonce: string;
};

/**
 * This model represents everything related to Connections.
 */
export default class ConnectionsModel extends EventEmitter {
    private personalCloudConnections: Connection[]; // List of all know connections with personal devices
    private partnerConnections: Connection[]; // List of all know connections with partner devices
    private readonly commServerUrl = 'wss://uke-comm.freeda.one';
    // private readonly commServerUrl = 'ws://localhost:8000';
    private myInstance: VersionedObjectResult<Instance> | undefined;
    private authenticatedContactsList: AuthenticatedContactsList;

    constructor() {
        super();
        this.personalCloudConnections = [];
        this.partnerConnections = [];
        this.authenticatedContactsList = {} as AuthenticatedContactsList;
    }

    /**
     * At instance initialisation search for old connections saved in memory and try to reopen them.
     */
    async init(): Promise<void> {
        this.personalCloudConnections = [];
        this.partnerConnections = [];

        const myInstanceIdHash = getInstanceIdHash();

        if (myInstanceIdHash === undefined) {
            this.emit('error', 'Unable to find instance.');
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }

        this.myInstance = await getObjectByIdHash(myInstanceIdHash);

        try {
            // Get previous connection that my instance had.
            this.authenticatedContactsList = (
                await getObjectByIdObj({
                    type: 'AuthenticatedContactsList',
                    instanceIdHash: myInstanceIdHash
                })
            ).obj;

            if (this.authenticatedContactsList.personalContacts) {
                await this.fillConnectionsList(
                    this.authenticatedContactsList.personalContacts,
                    this.personalCloudConnections,
                    'authenticatedPersonalCloudDevice',
                    true
                );
            }

            if (this.authenticatedContactsList.otherContacts) {
                await this.fillConnectionsList(
                    this.authenticatedContactsList.otherContacts,
                    this.partnerConnections,
                    'authenticatedPartnerDevice',
                    false
                );
            }
        } catch (error) {
            if (error.name === 'FileNotFoundError') {
                // My instance didn't have connections in the past.
                this.authenticatedContactsList = {
                    type: 'AuthenticatedContactsList',
                    instanceIdHash: myInstanceIdHash,
                    personalContacts: [],
                    otherContacts: []
                };
            } else {
                this.emit('error', error.name);
                throw error;
            }
        }
    }

    /**
     * At instance reload we take all the previous saved authenticated contacts for this instance
     * (previous open connections with other instances) and for each authenticated contact object
     * we create a new entrance in the destinationList list and restart the connections with the
     * instance memorised in the authenticated contact object.
     *
     * @param {SHA256Hash<AuthenticatedContact>[]} sourceList -> for instances that I own will be
     * this.authenticatedContactsList.personalContacts and for friends instance will be
     * this.authenticatedContactsList.otherContacts
     *
     * @param {Connection[]} destinationList -> for instances that I own will be
     * this.personalCloudConnections and for friends instance will be this.friendConnections
     *
     * @param {string} eventMessage -> for instances that I own will be
     * authenticatedPersonalCloudDevice and for friends instance will be authenticatedPartnerDevice
     *
     * @param {boolean} takeOver
     */
    async fillConnectionsList(
        sourceList: SHA256Hash<AuthenticatedContact>[],
        destinationList: Connection[],
        eventMessage: string,
        takeOver: boolean
    ): Promise<void> {
        if (this.myInstance === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noInstance'));
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }

        for await (const authContactHash of sourceList) {
            const authenticatedContact = await getObject(authContactHash);
            const communicationManagerAPI = createCommunicationManager(this.myInstance.idHash);
            const connection = {
                communicationManagerAPI,
                authenticatedContact,
                connectionState: false
            };

            destinationList.push(connection);

            this.emit(eventMessage);

            // we don't wait until the other instance connects with us,
            // just start the connection from our point of view
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.connectNextTime(connection, takeOver);
        }
    }

    /**
     * Generated the pairing information needed for generating the QR code for
     * pairing with partner instance.
     */
    async generatePairingInformation(): Promise<PairingInformation> {
        if (this.myInstance === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noInstance'));
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }

        const communicationManagerAPI = createCommunicationManager(this.myInstance.idHash);
        const pairingInformation = await communicationManagerAPI.getFirstPairingInformation(false);
        this.partnerConnections.push({
            pairingInformation,
            communicationManagerAPI,
            connectionState: false
        });

        return pairingInformation;
    }

    /**
     * This function is used for connecting for the first time with a partner instance.
     *
     * @param {PairingInformation} pairingInformation
     * @param {boolean} invited
     * @param {string} secret
     */
    async connect(
        pairingInformation: PairingInformation,
        invited: boolean,
        secret: string
    ): Promise<void> {
        if (this.myInstance === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.connectionWithoutInstance'));
            throw new Error(i18n.t('errors:connectionModel.connectionWithoutInstance'));
        }

        if (invited) {
            // exchange public key information so that other instance's public key will be the remote public key
            const otherInstancePubKey = pairingInformation.publicKeyLocal;
            pairingInformation.publicKeyLocal = pairingInformation.publicKeyRemote;
            pairingInformation.publicKeyRemote = otherInstancePubKey;

            const communicationManagerAPI = createCommunicationManager(this.myInstance.idHash);
            this.partnerConnections.push({
                pairingInformation,
                communicationManagerAPI,
                connectionState: false
            });
        }

        const connection = this.partnerConnections.find((con) => {
            return con.pairingInformation.publicKeyRemote === pairingInformation.publicKeyRemote;
        });

        if (connection === undefined) {
            throw new Error(i18n.t('errors:connectionModel.connectionFailed'));
        }

        const communicationManagerAPI = connection.communicationManagerAPI;
        communicationManagerAPI.setPassword(secret);

        try {
            connection.authenticatedContact = await communicationManagerAPI.connectFirstTime(
                this.commServerUrl,
                pairingInformation,
                invited
            );
        } catch (error) {
            this.emit('error', error.name);
            throw error;
        }

        if (connection.authenticatedContact === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noConnection'));
            throw new Error(i18n.t('errors:connectionModel.noConnection'));
        }

        await this.shareQuestionnairesWithPartner(connection.authenticatedContact);

        await this.saveAuthenticatedContact(
            connection.authenticatedContact,
            pairingInformation.takeOver
        );

        this.emit('authenticatedPartnerDevice');

        this.startChum(connection, pairingInformation.takeOver);
        this.emit('connectionEstablished');
    }

    /**
     * This function is used for reestablishing a connection with another instance.
     * The authenticated contact object which is needed for this function is the
     * result if the first connection between two instances.
     *
     * @param {Connection} connection
     * @param {boolean} takeOver
     */
    async connectNextTime(connection: Connection, takeOver: boolean): Promise<void> {
        const {communicationManagerAPI, authenticatedContact} = connection;

        if (authenticatedContact) {
            await communicationManagerAPI.connectNextTime(this.commServerUrl, authenticatedContact);
            this.startChum(connection, takeOver);
        }
    }

    /**
     * Generated the pairing information needed for creating the QR code for
     * pairing for the first time with another instance that I own.
     *
     * @param {string} secret
     */
    async generateInformationForTakeOver(secret: string): Promise<InformationForTakeOver> {
        if (this.myInstance === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noInstance'));
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }

        const communicationManagerAPI = createCommunicationManager(this.myInstance.idHash);
        communicationManagerAPI.setPassword(secret);

        const pairingInformation = await communicationManagerAPI.getFirstPairingInformation(true);
        this.personalCloudConnections.push({
            pairingInformation,
            communicationManagerAPI,
            connectionState: false
        });

        const instanceOwner = await getObjectByIdHash(this.myInstance.obj.owner);
        const randomEmail = instanceOwner.obj.email;

        const generatedNonce = await communicationManagerAPI.generateDerivationKey();

        return {pairingInformation, randomEmail, generatedNonce};
    }

    /**
     * Connect for the first time with a instance that I own. The QR code should
     * contain all the required information.
     * The user has to use the same password in both devices and after the authentication
     * is done, the function will return. The method takeOverInstance should be called so
     * the connection can be established.
     * In this step the instance that has scanned the QR code only tries to authenticate to the
     * instance that has generated the QR code. The instance object for the instance that will be
     * tacked over is not generated yet.
     *
     * @param {PairingInformation} pairingInformation
     * @param {boolean} invited
     * @param {string} secret
     * @param {string} receivedNonce
     */
    async connectToPersonalCloud(
        pairingInformation: PairingInformation,
        invited: boolean,
        secret: string,
        receivedNonce?: string
    ): Promise<void> {
        let communicationManager;

        if (invited) {
            // exchange public key information so that other instance's public key will be the remote public key
            const otherInstancePubKey = pairingInformation.publicKeyLocal;
            pairingInformation.publicKeyLocal = pairingInformation.publicKeyRemote;
            pairingInformation.publicKeyRemote = otherInstancePubKey;

            communicationManager = createCommunicationManager();
            communicationManager.setPassword(secret);
            await communicationManager.generateDerivationKey(receivedNonce);

            this.personalCloudConnections.push({
                pairingInformation,
                communicationManagerAPI: communicationManager,
                connectionState: false
            });
        } else {
            if (this.myInstance === undefined) {
                this.emit('error', i18n.t('errors:connectionModel.noInstance'));
                throw new Error(i18n.t('errors:connectionModel.noInstance'));
            }

            const connection = this.personalCloudConnections.find((con) => {
                return (
                    con.pairingInformation.publicKeyRemote === pairingInformation.publicKeyRemote
                );
            });

            if (connection === undefined) {
                this.emit('error', i18n.t('errors:connectionModel.connectionFailed'));
                throw new Error(i18n.t('errors:connectionModel.connectionFailed'));
            }

            communicationManager = connection.communicationManagerAPI;
            communicationManager.setPassword(secret);
        }

        await communicationManager.connectToPersonalCloud(
            this.commServerUrl,
            pairingInformation,
            invited
        );
    }

    /**
     * After the second instance (the one that will be tacked over) was
     * created, the connection can be established.
     * After the person keys were overwritten, the chum connection can
     * be established between the two instances.
     *
     * @param {PairingInformation} pairingInformation
     * @param {boolean} invited
     */
    async takeOverInstance(
        pairingInformation: PairingInformation,
        invited: boolean
    ): Promise<void> {
        const connection = this.personalCloudConnections.find((con) => {
            return con.pairingInformation.publicKeyRemote === pairingInformation.publicKeyRemote;
        });

        if (connection === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.connectionFailed'));
            throw new Error(i18n.t('errors:connectionModel.connectionFailed'));
        }

        const communicationManager = connection.communicationManagerAPI;
        const thisInstanceIdHash = getInstanceIdHash();

        if (thisInstanceIdHash === undefined) {
            this.emit('error', 'Unable to find instance.');
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }
        this.myInstance = await getObjectByIdHash(thisInstanceIdHash);

        connection.authenticatedContact = await communicationManager.overwriteOwner(
            thisInstanceIdHash,
            invited
        );

        connection.authenticatedContact.personIdHash = this.myInstance.obj.owner;

        await this.saveAuthenticatedContact(
            connection.authenticatedContact,
            pairingInformation.takeOver
        );

        if (!this.personalCloudConnections.includes(connection)) {
            this.personalCloudConnections.push(connection);
        }

        this.emit('authenticatedPersonalCloudDevice');

        this.startChum(connection, pairingInformation.takeOver);
        this.emit('connectionEstablished');
    }

    /**
     * Starts a chum connection with the instance from the authenticated contact.
     *
     * @param {Connection} connection
     * @param {boolean} takeOver
     */
    startChum(connection: Connection, takeOver: boolean): void {
        connection.communicationManagerAPI
            .consumeReceivedMessage()
            .then(async (message) => {
                if (message === 'delete') {
                    await this.closeConnection(connection, takeOver);
                }
            })
            .catch((err) => console.error(err));

        if (this.myInstance === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noInstance'));
            throw new Error(i18n.t('errors:connectionModel.noInstance'));
        }

        const {communicationManagerAPI, authenticatedContact, pairingInformation} = connection;

        if (pairingInformation.takeOver === false && authenticatedContact === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.noPartner'));
            throw new Error(i18n.t('errors:connectionModel.noPartner'));
        }

        // todo: other instance object is never saved
        // const otherInstance = await getObjectByIdHash(authenticatedContact.instanceIdHash);
        const websocketPromisifierAPI = communicationManagerAPI.getWebSocketPromisifier();
        websocketPromisifierAPI.promise.catch((error) => {
            this.emit('error', error.name);
            throw error;
        });

        websocketPromisifierAPI.localPersonIdHash = connection.authenticatedContact.personIdHash;
        websocketPromisifierAPI.remotePersonIdHash = connection.authenticatedContact.personIdHash;

        const defaultInitialChumObj: ChumSyncOptions = {
            connection: websocketPromisifierAPI,
            chumName: 'MochaTest',
            localInstanceName: this.myInstance.obj.name,
            // remoteInstanceName: otherInstance.obj.name,
            remoteInstanceName: this.myInstance.obj.name,
            keepRunning: true,
            maxNotificationDelay: 20
        };

        connection.connectionState = true;
        // emit the event for the available devices list to refresh
        // in Personal Cloud page and the new state to be displayed
        takeOver
            ? this.emit('authenticatedPersonalCloudDevice')
            : this.emit('authenticatedPartnerDevice');

        // the chum will be saved after the connection is closed
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        connection.chum = createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            defaultInitialChumObj
        );

        connection.chum.finally(() => {
            connection.connectionState = false;
            takeOver
                ? this.emit('authenticatedPersonalCloudDevice')
                : this.emit('authenticatedPartnerDevice');
        });
    }

    private checkAuthenticatedContactList(): void {
        if (this.authenticatedContactsList === undefined) {
            this.emit('error', i18n.t('errors:connectionModel.saveAuthContact'));
            throw new Error(i18n.t('errors:connectionModel.saveAuthContact'));
        }

        if (this.authenticatedContactsList.personalContacts === undefined) {
            this.authenticatedContactsList.personalContacts = [];
        }

        if (this.authenticatedContactsList.otherContacts === undefined) {
            this.authenticatedContactsList.otherContacts = [];
        }
    }

    /**
     * Every time a connection is being established, an authenticated contact object is returned.
     * In order to reopen the connections at instance login we need to store the authenticated
     * contacts objects. This function stores the authenticated contact objects and also keeps
     * the hash of the object in a list which can be used to reopen at instance reload using only
     * the id hash of the instance.
     *
     * @param {AuthenticatedContact} authenticatedContact
     * @param {boolean} takeOver
     */
    async saveAuthenticatedContact(
        authenticatedContact: AuthenticatedContact,
        takeOver: boolean
    ): Promise<void> {
        this.checkAuthenticatedContactList();

        const authenticatedContactObj = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'AuthenticatedContact',
                ...authenticatedContact
            }
        );

        if (takeOver && this.authenticatedContactsList.personalContacts) {
            this.authenticatedContactsList.personalContacts.push(authenticatedContactObj.hash);
        } else if (!takeOver && this.authenticatedContactsList.otherContacts) {
            this.authenticatedContactsList.otherContacts.push(authenticatedContactObj.hash);
        }

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            this.authenticatedContactsList
        );
    }

    /**
     * Get a list of connections/known devices that I own.
     *
     * @returns {Connection[]}
     */
    getPersonalCloudDevices(): Connection[] {
        return [...this.personalCloudConnections];
    }

    /**
     * Get a list of connections/known devices from friends.
     *
     * @returns {Connection[]}
     */
    getPartnerDevices(): Connection[] {
        return [...this.partnerConnections];
    }

    /**
     * Closes all existing connection with the web sockets server.
     */
    async closeAllConnections(): Promise<void> {
        for await (const personalCloudConnection of this.personalCloudConnections) {
            personalCloudConnection.communicationManagerAPI.closeConnection();
            await personalCloudConnection.chum;
        }

        for await (const friendConnection of this.partnerConnections) {
            friendConnection.communicationManagerAPI.closeConnection();
            await friendConnection.chum;
        }
    }

    /**
     * Close the connection identified by the connection parameter.
     *
     * @param {Connection} connection
     * @param {boolean} takeOver
     */
    async closeConnection(connection: Connection, takeOver: boolean): Promise<void> {
        // tell the instance on the other end to delete this connection
        connection.communicationManagerAPI
            .sendEncryptedMessage('delete', false, false)
            .catch((err) => {
                {
                    if (err.name !== 'WebsocketError') {
                        console.error(err);
                    }
                }
            });

        connection.communicationManagerAPI.closeConnection();
        connection.connectionState = false;

        await connection.chum;

        if (takeOver) {
            this.personalCloudConnections = this.personalCloudConnections.filter(
                (obj) => obj !== connection
            );

            this.emit('authenticatedPersonalCloudDevice');
        } else {
            this.partnerConnections = this.partnerConnections.filter((obj) => obj !== connection);

            this.emit('authenticatedPartnerDevice');
        }

        /**
         * Save this state of the application.
         * Remove the deleted connections in order to not be displayed anymore.
         */

        this.checkAuthenticatedContactList();

        const personalContactsList = [];
        const otherContactsList = [];

        for await (const personalContact of this.personalCloudConnections) {
            if (personalContact.authenticatedContact) {
                personalContactsList.push(
                    await calculateHashOfObj(personalContact.authenticatedContact)
                );
            }
        }

        this.authenticatedContactsList.personalContacts = personalContactsList;

        for await (const partnerContact of this.partnerConnections) {
            if (partnerContact.authenticatedContact) {
                otherContactsList.push(
                    await calculateHashOfObj(partnerContact.authenticatedContact)
                );
            }
        }

        this.authenticatedContactsList.otherContacts = otherContactsList;

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            this.authenticatedContactsList
        );
    }

    /**
     * When connecting with a partner, the only data that will be synchronised is the questionnaire.
     *
     * @param {AuthenticatedContact} authenticatedContact
     */
    async shareQuestionnairesWithPartner(
        authenticatedContact: AuthenticatedContact
    ): Promise<void> {
        const channelInfoIdHash = await calculateIdHashOfObj({
            type: 'ChannelInfo',
            id: 'questionnaire'
        });

        const setAccessParam: SetAccessParam = {
            group: [],
            id: channelInfoIdHash,
            mode: SET_ACCESS_MODE.REPLACE,
            person: [authenticatedContact.personIdHash]
        };
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
    }
}
