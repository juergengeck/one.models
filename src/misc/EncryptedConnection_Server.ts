import WebSocket from 'ws';
import CommunicationInitiationProtocol, {isClientMessage} from './CommunicationInitiationProtocol';
import {fromByteArray, toByteArray} from 'base64-js';
import tweetnacl from 'tweetnacl';
import EncryptedConnection from './EncryptedConnection';

/**
 * This class implements the 'server' side of an encrypted communication.
 *
 * All methods in this class are used to set up the encrypted channel
 * by negotiating keys.
 * The methods for encrypted communication are provided by the base
 * class EncryptedConnection after the keys have been negotiated.
 */
class EncryptedConnetion_Server extends EncryptedConnection {
    /**
     * Creates an encrypted connection
     *
     * Server side - This is the side that accepted the connection.
     *
     * @param {WebSocket} ws - The websocket used for communication.
     */
    constructor(ws: WebSocket) {
        super(ws, true);
    }

    // ######## Message sending ########

    /**
     * Send the communication_ready command in order to signal the other
     * party that the communication channel can now be used.
     *
     * @returns {Promise<void>}
     */
    public async sendCommunicationReadyMessage(): Promise<void> {
        await this.sendUnencryptedMessage({command: 'communication_ready'});
    }

    /**
     * This function sets up the encryption by exchanging public keys encrypted.
     *
     * Sending public keys encrypted prevents MITM (Man in the middle) attacks
     * Generating new keys for each connection provides PFS (Perfect forward secrecy)
     *
     * @param {(text: Uint8Array) => Uint8Array} encrypt - Function that encrypts the data stream with the known static keys
     * @param {(cypher: Uint8Array) => Uint8Array} decrypt - Function that dencrypts the data stream with the known static keys
     * @param {boolean} rejectConnection - If true kill the connection after successful authentication of the
     *                                     keys. The reason for doing it here and not earlier is, that we would
     *                                     expose the rejection to communicate without authentification, so others
     *                                     who don't posess the private key to the specified key in communication_request
     *                                     could probe us for keys we accept / we don't accept based on timing.
     * @returns {Promise<void>}
     */
    public async exchangeKeys(
        encrypt: (text: Uint8Array) => Uint8Array,
        decrypt: (cypher: Uint8Array) => Uint8Array,
        rejectConnection: boolean = false
    ): Promise<void> {
        // Generate a new key pair
        const tempKeyPair = tweetnacl.box.keyPair();

        // Exchange public keys
        const publicKeyOther = decrypt(await this.webSocketPB.waitForBinaryMessage());
        if (rejectConnection) {
            this.webSocketPB.close();
        }
        await this.webSocketPB.send(encrypt(tempKeyPair.publicKey));

        // Calculate the shared key used for communication
        this.sharedKey = tweetnacl.box.before(publicKeyOther, tempKeyPair.secretKey);
    }

    // ######## Message receiving ########

    /**
     * Wait for an unencrypted message (only used for setting up the encryption)
     *
     * @param {T} command - the command to wait for
     * @returns {Promise<CommunicationInitiationProtocol.ClientMessages[T]>}
     */
    public async waitForUnencryptedMessage<
        T extends keyof CommunicationInitiationProtocol.ClientMessages
    >(command: T): Promise<CommunicationInitiationProtocol.ClientMessages[T]> {
        const message = this.unpackBinaryFields(
            await this.webSocketPB.waitForJSONMessageWithType(command, 'command')
        );
        if (isClientMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

    // ######## Private ########

    /**
     * Send an unencrypted message (only used for setting up the encryption).
     *
     * @param {T} message - The message to send
     * @returns {Promise<void>}
     */
    private async sendUnencryptedMessage<
        T extends CommunicationInitiationProtocol.ServerMessageTypes
    >(message: T): Promise<void> {
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

    /**
     * Convert fields from base64 encoding to Uint8Array.
     *
     * @param {any} message - The message to convert
     * @returns {any} - The converted message
     */
    private unpackBinaryFields(message: any): any {
        if (typeof message.command !== 'string') {
            throw Error(`Parsing message failed!`);
        }

        if (message.command === 'communication_request') {
            if (message.sourcePublicKey && typeof message.sourcePublicKey === 'string') {
                message.sourcePublicKey = toByteArray(message.sourcePublicKey);
            }
            if (message.targetPublicKey && typeof message.targetPublicKey === 'string') {
                message.targetPublicKey = toByteArray(message.targetPublicKey);
            }
        }

        return message;
    }
}

export default EncryptedConnetion_Server;
