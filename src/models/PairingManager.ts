import {ensurePublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {
    createCryptoApiFromDefaultKeys,
    getDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {Instance} from '@refinio/one.core/lib/recipes';
import type {Person} from '@refinio/one.core/lib/recipes';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {
    hexToUint8Array,
    isHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {countEnumerableProperties} from '@refinio/one.core/lib/util/type-checks';
import {isObject, isString} from '@refinio/one.core/lib/util/type-checks-basic';
import type Connection from '../misc/Connection/Connection';
import {
    sendPeerMessage,
    waitForPeerMessage
} from '../misc/ConnectionEstablishment/protocols/CommunicationInitiationProtocolMessages';
import {connectWithEncryption} from '../misc/ConnectionEstablishment/protocols/EncryptedConnectionHandshake';
import {exchangeInstanceIdObjects} from '../misc/ConnectionEstablishment/protocols/ExchangeInstanceIds';
import {verifyAndExchangePersonId} from '../misc/ConnectionEstablishment/protocols/ExchangePersonIds';
import {
    convertIdentityToProfile,
    convertOneInstanceEndpointToIdentity
} from '../misc/IdentityExchange';
import {getLocalInstanceOfPerson} from '../misc/instance';
import {OEvent} from '../misc/OEvent';
import type LeuteModel from './Leute/LeuteModel';

const MessageBus = createMessageBus('Protocols/StartChum');

/**
 * This is the information that needs to pe transmitted securely to the device that shall be paired
 */
export type Invitation = {
    token: string; // This is a secret, that gives the other person the authority
    publicKey: HexString; // Public key of the other instance
    url: string; // How to contact the other instance
};

/**
 * Checks if the given parameter is a `PairingInformation` object
 * @param thing
 * @returns {boolean}
 */
export function isInvitation(thing: unknown): thing is Invitation {
    return (
        isObject(thing) &&
        isString(thing.token) &&
        isHexString(thing.publicKey) &&
        isString(thing.url) &&
        countEnumerableProperties(thing) === 3
    );
}

/**
 * This type holds the data associated with an authentication token for pairing
 */
type ActiveInvitation = {
    token: string;
    localPersonId: SHA256IdHash<Person>;
    expirationTimeoutHandle: ReturnType<typeof setTimeout>;
};

export default class PairingManager {
    /**
     * Event is emitted when the one time authentication was successful. The emitted event value represents the
     * authentication token.
     */
    public readonly onPairingSuccess = new OEvent<
        (
            initiatedLocally: boolean,
            localPersonId: SHA256IdHash<Person>,
            localInstanceId: SHA256IdHash<Instance>,
            remotePersonId: SHA256IdHash<Person>,
            remoteInstanceId: SHA256IdHash<Instance>,
            token: string
        ) => void
    >();

    public inviteExpirationDurationInMs: number;

    private readonly leuteModel: LeuteModel;
    private readonly activeInvitations: Map<string, ActiveInvitation>;
    private readonly url: string;

    /**
     *
     * @param leuteModel
     * @param inviteExpirationDurationInMs
     * @param url - The url over which to contact this instance. This should be determined
     * differently for each invite based on the incoming routes for the person ... but we are not
     * there, yet.
     */
    constructor(leuteModel: LeuteModel, inviteExpirationDurationInMs: number, url: string) {
        this.leuteModel = leuteModel;
        this.activeInvitations = new Map<string, ActiveInvitation>();
        this.inviteExpirationDurationInMs = inviteExpirationDurationInMs;
        this.url = url;
    }

    /**
     * Generates the information for sharing which will be sent in the QR code.
     *
     * @param myPersonId
     * @param token supply a token instead generating a new one
     * @returns
     */
    public async createInvitation(
        myPersonId?: SHA256IdHash<Person>,
        token?: string
    ): Promise<Invitation> {
        if (myPersonId === undefined) {
            myPersonId = await this.leuteModel.myMainIdentity();
        }

        if (token === undefined) {
            token = await createRandomString();
        }

        // Add the token to the list of valid pairing tokens
        const mapKey = token;
        this.activeInvitations.set(mapKey, {
            token,
            localPersonId: myPersonId,
            expirationTimeoutHandle: setTimeout(
                () => this.activeInvitations.delete(mapKey),
                this.inviteExpirationDurationInMs
            )
        });

        const defaultInstance = await getLocalInstanceOfPerson(myPersonId);
        const defaultInstanceKeys = await getDefaultKeys(defaultInstance);
        const keys = await getObject(defaultInstanceKeys);

        return {
            token: token,
            publicKey: keys.publicKey,
            url: this.url
        };
    }

    /**
     * Connect to target using pairing information with the goal to pair / being taken over
     *
     * @param invitation
     * @param myPersonId
     * @returns
     */
    public async connectUsingInvitation(
        invitation: Invitation,
        myPersonId?: SHA256IdHash<Person>
    ): Promise<void> {
        if (myPersonId === undefined) {
            myPersonId = await this.leuteModel.myMainIdentity();
        }

        const cryptoApi = await createCryptoApiFromDefaultKeys(myPersonId);
        const myInstanceId = await getLocalInstanceOfPerson(myPersonId);

        // Connect to target
        const connInfo = await connectWithEncryption(
            invitation.url,
            cryptoApi.createEncryptionApiWithKeysAndPerson(
                ensurePublicKey(hexToUint8Array(invitation.publicKey))
            )
        );

        const conn = connInfo.connection;

        const personInfo = await verifyAndExchangePersonId(this.leuteModel, conn, myPersonId, true);

        const instanceInfo = await exchangeInstanceIdObjects(conn, myInstanceId);

        // Start the pairing protocol
        try {
            // Step 2: Send the authentication token
            sendPeerMessage(conn, {
                command: 'authentication_token',
                token: invitation.token
            });

            // Step 3: Wait for remote identity
            const remoteIdentity = (await waitForPeerMessage(conn, 'identity')).obj;
            const remoteProfile = await convertIdentityToProfile(remoteIdentity);

            // Step 4: Send my own identity
            const oneInstanceEndpoints = await this.leuteModel.getMyLocalEndpoints(myPersonId);
            if (oneInstanceEndpoints.length === 0) {
                throw new Error(
                    'Cannot exchange identity, the main profile does not contain a OneInstanceEndpoint'
                );
            }

            sendPeerMessage(conn, {
                command: 'identity',
                obj: await convertOneInstanceEndpointToIdentity(oneInstanceEndpoints[0])
            });

            // Notify the app of successful pairing and then close the connection.
            this.onPairingSuccess.emit(
                true,
                oneInstanceEndpoints[0].personId,
                oneInstanceEndpoints[0].instanceId,
                remoteProfile.personId,
                instanceInfo.remoteInstanceId,
                invitation.token
            );

            conn.close();
        } catch (e) {
            connInfo.connection.close(e.message);
            throw e;
        }
    }

    /**
     *
     * @param conn
     * @param localPersonId
     * @param localInstanceId
     * @param remotePersonId
     * @param remoteInstanceId
     */
    public async acceptInvitation(
        conn: Connection,
        localPersonId: SHA256IdHash<Person>,
        localInstanceId: SHA256IdHash<Instance>,
        remotePersonId: SHA256IdHash<Person>,
        remoteInstanceId: SHA256IdHash<Instance>
    ): Promise<void> {
        // Wait for the authentication token and verify it against the token list
        const pairingToken = await waitForPeerMessage(conn, 'authentication_token');

        // Verify the auth token
        const authData = this.activeInvitations.get(pairingToken.token);
        if (authData === undefined) {
            throw new Error('Authentication token is not existing.');
        }

        // Verify the received id with the local id used to generate the code
        if (authData.localPersonId !== localPersonId) {
            throw new Error('The authentication token was not generated for the requested person.');
        }

        // Send my own identity
        const oneInstanceEndpoints = await this.leuteModel.getMyLocalEndpoints(localPersonId);
        if (oneInstanceEndpoints.length === 0) {
            throw new Error(
                'Cannot exchange identity, the main profile does not contain a OneInstanceEndpoint'
            );
        }
        sendPeerMessage(conn, {
            command: 'identity',
            obj: await convertOneInstanceEndpointToIdentity(oneInstanceEndpoints[0])
        });

        // Step 4: Wait for remote identity
        const remoteIdentity = (await waitForPeerMessage(conn, 'identity')).obj;
        await convertIdentityToProfile(remoteIdentity);

        // Done, so remove the one time authentication token from the list
        clearTimeout(authData.expirationTimeoutHandle);
        this.activeInvitations.delete(pairingToken.token);

        // Notify the app of successful pairing and then close the connection.
        this.onPairingSuccess.emit(
            false,
            localPersonId,
            localInstanceId,
            remotePersonId,
            remoteInstanceId,
            pairingToken.token
        );
    }

    /**
     * Invalidate the passed invitation.
     *
     * @param invitation
     */
    public invalidateInvitation(invitation: Invitation): void {
        this.activeInvitations.delete(invitation.token);
    }

    /**
     * Invalidate all active invitations.
     */
    public invalidateAllInvitations(): void {
        this.activeInvitations.clear();
    }
}
