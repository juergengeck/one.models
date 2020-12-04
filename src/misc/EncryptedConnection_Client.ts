import WebSocket from 'isomorphic-ws';
import CommunicationInitiationProtocol, {isServerMessage} from './CommunicationInitiationProtocol';
import {fromByteArray} from 'base64-js';
import tweetnacl from 'tweetnacl';
import EncryptedConnection from './EncryptedConnection';
import WebSocketPromiseBased from './WebSocketPromiseBased';

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
     * @param {string} url - The url to which to open the connection.
     */
    constructor(url: string) {
        super(new WebSocketPromiseBased(new WebSocket(url)), false);
    }

    // ######## Sending messages for encryption setup ########

    /**
     * Send the communication request message
     *
     * @param {Uint8Array} sourcePublicKey
     * @param {Uint8Array} targetPublicKey
     * @returns {Promise<void>}
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
     * @param {(text: Uint8Array) => Uint8Array} encrypt - Function that encrypts the data stream with the known static keys
     * @param {(cypher: Uint8Array) => Uint8Array} decrypt - Function that dencrypts the data stream with the known static keys
     * @returns {Promise<void>}
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
     * @param {T} command - the command to wait for
     * @returns {Promise<CommunicationInitiationProtocol.ClientMessages[T]>}
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
     * @param {T} message - The message to send
     * @returns {Promise<void>}
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
