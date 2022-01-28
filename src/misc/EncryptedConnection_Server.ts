import CommunicationInitiationProtocol, {isClientMessage} from './CommunicationInitiationProtocol';
import tweetnacl from 'tweetnacl';
import EncryptedConnection from './EncryptedConnection';
import type WebSocketPromiseBased from './WebSocketPromiseBased';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';

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
     * @param ws - The websocket used for communication.
     */
    constructor(ws: WebSocketPromiseBased) {
        super(ws, true);
    }

    // ######## Message sending ########

    /**
     * Send the communication_ready command in order to signal the other
     * party that the communication channel can now be used.
     */
    public async sendCommunicationReadyMessage(): Promise<void> {
        await this.sendUnencryptedMessage({command: 'communication_ready'});
    }

    /**
     * This function sets up the encryption by exchanging public keys encrypted.
     *
     * It also verifies, that the peer has the private key to the public key, because otherwise the decryption would fail.
     *
     * Sending public keys encrypted prevents MITM (Man in the middle) attacks
     * Generating new keys for each connection provides PFS (Perfect forward secrecy)
     *
     * @param encrypt - Function that encrypts the data stream with the known static keys
     * @param decrypt - Function that dencrypts the data stream with the known static keys
     * @param rejectConnection - If true kill the connection after successful authentication of the keys.
     *                           The reason for doing it here and not earlier is, that we would
     *                           expose the rejection to communicate without authentification, so others
     *                           who don't posess the private key to the specified key in communication_request
     *                           could probe us for keys we accept / we don't accept based on timing.
     *                           Another reason why we do it here with a boolean flag is to ensure that the permission
     *                           to communicate has been done calculated before this step
     *                           (for timing reasons it should always be done earlier)
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
     * @param command - the command to wait for
     * @returns
     */
    public async waitForUnencryptedMessage<
        T extends keyof CommunicationInitiationProtocol.ClientMessages
    >(command: T): Promise<CommunicationInitiationProtocol.ClientMessages[T]> {
        const message = EncryptedConnetion_Server.unpackBinaryFields(
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
     * @param message - The message to send
     */
    private async sendUnencryptedMessage<
        T extends CommunicationInitiationProtocol.ServerMessageTypes
    >(message: T): Promise<void> {
        await this.webSocketPB.waitForOpen();
        await this.webSocketPB.send(
            JSON.stringify(message, function (key, value) {
                if (value.constructor === Uint8Array) {
                    return uint8arrayToHexString(value);
                } else {
                    return value;
                }
            })
        );
    }

    /**
     * Convert fields from Hex encoding to Uint8Array.
     *
     * @param message - The message to convert
     * @returns - The converted message
     */
    private static unpackBinaryFields(message: any): any {
        if (typeof message.command !== 'string') {
            throw Error(`Parsing message failed!`);
        }

        if (message.command === 'communication_request') {
            if (message.sourcePublicKey && typeof message.sourcePublicKey === 'string') {
                message.sourcePublicKey = hexToUint8Array(message.sourcePublicKey);
            }
            if (message.targetPublicKey && typeof message.targetPublicKey === 'string') {
                message.targetPublicKey = hexToUint8Array(message.targetPublicKey);
            }
        }

        return message;
    }
}

export default EncryptedConnetion_Server;
