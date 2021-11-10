import CommunicationInitiationProtocol, {isServerMessage} from './CommunicationInitiationProtocol';
import {fromByteArray} from 'base64-js';
import tweetnacl from 'tweetnacl';
import EncryptedConnection from './EncryptedConnection';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import {createWebSocket} from '@refinio/one.core/lib/system/websocket';

/**
 * This class implements the 'client' side of an encrypted communication.
 *
 * All methods in this class are used to set up the encrypted channel
 * by negotiating keys.
 * The methods for encrypted communication are provided by the base
 * class EncryptedConnection after the keys have been negotiated.
 */
class EncryptedConnection_Client extends EncryptedConnection {
    /**
     * Creates an encrypted connection
     *
     * Client side - This is the side that initiated communication.
     *
     * @param url - The url to which to open the connection.
     */
    constructor(url: string) {
        super(new WebSocketPromiseBased(createWebSocket(url)), false);
    }

    // ######## Sending messages for encryption setup ########

    /**
     * Send the communication request message
     *
     * @param sourcePublicKey
     * @param targetPublicKey
     */
    public async sendCommunicationRequestMessage(
        sourcePublicKey: Uint8Array,
        targetPublicKey: Uint8Array
    ): Promise<void> {
        await this.sendUnencryptedMessage({
            command: 'communication_request',
            sourcePublicKey,
            targetPublicKey
        });
    }

    /**
     * This function sets up the encryption by exchanging public keys encrypted.
     *
     * Sending public keys encrypted prevents MITM (Man in the middle) attacks
     * Generating new keys for each connection provides PFS (Perfect forward secrecy)
     *
     * @param encrypt - Function that encrypts the data stream with the known static keys
     * @param decrypt - Function that dencrypts the data stream with the known static keys
     */
    public async exchangeKeys(
        encrypt: (text: Uint8Array) => Uint8Array,
        decrypt: (cypher: Uint8Array) => Uint8Array
    ): Promise<void> {
        // Generate a new key pair
        const tempKeyPair = tweetnacl.box.keyPair();

        // Exchange public keys
        await this.webSocketPB.send(encrypt(tempKeyPair.publicKey));
        const publicKeyOther = decrypt(await this.webSocketPB.waitForBinaryMessage());

        // Calculate the shared key used for communication
        this.sharedKey = tweetnacl.box.before(publicKeyOther, tempKeyPair.secretKey);
    }

    // ######## Receiving messages for encryption setup ########

    /**
     * Wait for an unencrypted message (only used for setting up the encryption)
     *
     * @param command - the command to wait for
     * @returns
     */
    public async waitForUnencryptedMessage<
        T extends keyof CommunicationInitiationProtocol.ServerMessages
    >(command: T): Promise<CommunicationInitiationProtocol.ServerMessages[T]> {
        if (this.sharedKey) {
            throw Error('No unencrypted chatter after encryption keys have been set up.');
        }

        const message = await this.webSocketPB.waitForJSONMessageWithType(command, 'command');
        if (isServerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

    // ######## Private API ########

    /**
     * Send an unencrypted message (only used for setting up the encryption).
     *
     * @param message - The message to send
     */
    private async sendUnencryptedMessage<
        T extends CommunicationInitiationProtocol.ClientMessageTypes
    >(message: T): Promise<void> {
        if (this.sharedKey) {
            throw Error('No unencrypted chatter after encryption keys have been set up.');
        }
        await this.webSocketPB.waitForOpen();
        await this.webSocketPB.send(
            JSON.stringify(message, function (key, value) {
                if (value.constructor === Uint8Array) {
                    return fromByteArray(value);
                } else {
                    return value;
                }
            })
        );
    }
}

export default EncryptedConnection_Client;
