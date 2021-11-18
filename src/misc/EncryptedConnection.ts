import {EventEmitter} from 'events';
import type WebSocketPromiseBased from './WebSocketPromiseBased';
import tweetnacl from 'tweetnacl';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {EncryptedConnectionInterface} from '@refinio/one.core/lib/websocket-promisifier';
import {OEvent} from './OEvent';

const MessageBus = createMessageBus('EncryptedConnection');

/**
 * This class implements an encrypted connection.
 *
 * The key negotiation is done by derived classes, because depending on the
 * side of the conversation (client: initiator of the connection / server:
 * acceptor of the connection) the key exchange procedure changes.
 */
class EncryptedConnection extends EventEmitter implements EncryptedConnectionInterface {
    /**
     * Event is emitted when an encrypted message is received. The event contains the decrypted
     * message.
     */
    public onMessage = new OEvent<(decrypted: Uint8Array) => void>();
    /**
     * Event is emitted when the message data type is invalid or the decryption fails.
     */
    public onError = new OEvent<(error: any) => void>();

    public webSocketPB: WebSocketPromiseBased; // Websocket used for communication
    protected sharedKey: Uint8Array | null = null; // The shared key used for encryption
    private localNonceCounter: number = 0; // The counter for the local nonce
    private remoteNonceCounter: number = 0; // The counter for the remote nonce

    /**
     * Creates an encryption layer above the passed websocket.
     *
     * Instantiating this class is not enough. The shared key pairs have to be set up
     * by a derived class through some kind of key negotiation procedure before the encryption
     * actually works.
     *
     * @param ws - The websocket that is used to exchange encrypted
     * messages.
     * @param evenLocalNonceCounter - If true the local instance uses even nonces,
     * otherwise odd.
     */
    constructor(ws: WebSocketPromiseBased, evenLocalNonceCounter: boolean) {
        super();
        this.webSocketPB = ws;

        // For simplicity we will count with the number type and it has a width of 32 bit
        // when doing logic operations (when converting to Uint8Array). So we need to be
        // sure that the nonce length is larger than that, because otherwise we would have
        // overflows which lead to duplicate nonce values.
        if (tweetnacl.box.nonceLength <= 4) {
            throw new Error('We assume the encryption nonce to be larger than 32 bits');
        }

        // Setup the initial nonce related values
        if (evenLocalNonceCounter) {
            this.localNonceCounter = 0;
            this.remoteNonceCounter = 1;
        } else {
            this.localNonceCounter = 1;
            this.remoteNonceCounter = 0;
        }

        // Setup events
        this.webSocketPB.onMessage((message: MessageEvent) => {
            // Only send events for encrypted messages and when the event interface is activated.
            // Because of nonce counting we can't have both running.
            if (this.sharedKey && this.webSocketPB.disableWaitForMessage) {
                try {
                    MessageBus.send('debug', "Message received via 'message' event.");
                    if (!(message.data instanceof ArrayBuffer)) {
                        throw new Error(
                            'Encrypted connections must use ArrayBuffer for transmitting data.'
                        );
                    }
                    const decrypted = this.decryptMessage(new Uint8Array(message.data));
                    this.emit('message', decrypted);
                    this.onMessage.emit(decrypted);
                } catch (e) {
                    this.close();
                    MessageBus.send('debug', `Error happened in message handler: ${e}`);
                    this.emit('error', e);
                    this.onError.emit(e);
                }
            }
        });
    }

    // ######## Socket Management & Settings ########

    /**
     * Get the underlying web socket instance
     *
     * @returns
     */
    get webSocket(): WebSocket {
        if (!this.webSocketPB.webSocket) {
            throw new Error('No Websocket is assigned to connection.');
        }
        return this.webSocketPB.webSocket;
    }

    /**
     * Releases the underlying websocket, so that it can be used by another class.
     *
     * Attention: If messages arrive in the meantime they might get lost.
     */
    public releaseWebSocket(): WebSocket {
        return this.webSocketPB.releaseWebSocket();
    }

    /**
     * Closes the web socket.
     *
     * @param reason - The reason for closing. If specified it is sent unencrypted to
     * the remote side!
     */
    public close(reason?: string): void {
        return this.webSocketPB.close(reason);
    }

    /**
     * Switches the interface to event based processing.
     *
     * This means that you can no longer use the waitFor*Message functions, but now you can use
     * the on('message')
     * events.
     *
     * @param value
     */
    public set switchToEvents(value: boolean) {
        this.webSocketPB.disableWaitForMessage = value;
    }

    /**
     * Get the waitForMessage state
     *
     * @returns
     */
    public get switchToEvents(): boolean {
        return this.webSocketPB.disableWaitForMessage;
    }

    /**
     * Set the request timeout.
     *
     * This timeout specifies how long the connection will wait for new messages in the wait*
     * methods.
     * @param timeout - The new timeout. -1 means forever, > 0 is the time in ms.
     */
    set requestTimeout(timeout: number) {
        this.webSocketPB.defaultTimeout = timeout;
    }

    /**
     * Get the current request timeout.
     *
     * @returns
     */
    get requestTimeout(): number {
        return this.webSocketPB.defaultTimeout;
    }

    // ######## Sending encrypted messages ########

    /**
     * Send string data encrypted.
     *
     * @param data - The data to send over the encrypted channel
     */
    public async sendMessage(data: string): Promise<void> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const textEncoder = new TextEncoder();
        await this.webSocketPB.send(this.encryptMessage(textEncoder.encode(data)));
    }

    /**
     * Send binary data encrypted.
     *
     * @param data - The data to send over the encrypted channel
     */
    public async sendBinaryMessage(data: Uint8Array): Promise<void> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        await this.webSocketPB.send(this.encryptMessage(data));
    }

    // ######## Receiving encrypted messages ########

    /**
     * Wait for an incoming message with a specific type for a specified period of time.
     *
     * @param type    - The type field of the message should have this type.
     * @param timeout - Number of msecs to wait for the message. -1 to wait forever
     * @param typekey - The name of the member that holds the type that is checked for
     * equality with the type param.
     * @return The promise will resolve when a value was
     * received. The value will be the `JSON.parse' result object. The promise will reject when
     * 1) the timeout expired
     * 2) the connection was closed
     * 3) the type of the received message doe not match parameter 'type'
     */
    public async waitForJSONMessageWithType(
        type: string,
        typekey: string = 'type',
        timeout: number = -2
    ): Promise<any> {
        const messageObj = await this.waitForJSONMessage(timeout);

        // Assert that is has a 'type' member
        if (!Object.prototype.hasOwnProperty.call(messageObj, typekey)) {
            throw new Error(`Received message without a "${typekey}" member.`);
        }

        // Assert that the type matches the requested one
        if (messageObj[typekey] !== type) {
            throw new Error(
                `Received unexpected type '${messageObj[typekey]}'. Expected type '${type}'.`
            );
        }

        return messageObj;
    }

    /**
     * Wait for an incoming message for a specified period of time.
     *
     * @param  timeout - Number of msecs to wait for the message. -1 to wait forever
     * @return The promise will resolve when a value was received. The value will
     * be the `JSON.parse` object The promise will reject when
     * 1) the timeout expired
     * 2) the connection was closed
     * 3) the type of the received message doe not match parameter 'type'
     */
    public async waitForJSONMessage(timeout: number = -2): Promise<any> {
        const message = await this.waitForMessage(timeout);

        // Convert from JSON to Object
        let messageObj;
        try {
            messageObj = JSON.parse(message);
        } catch (e) {
            throw new Error('Received message that does not conform to JSON: ' + e.toString());
        }

        return messageObj;
    }

    /**
     * Wait for string message.
     *
     * @returns The received message
     */
    public async waitForMessage(timeout: number = -1): Promise<string> {
        const decrypted = this.decryptMessage(await this.webSocketPB.waitForBinaryMessage(timeout));
        return new TextDecoder().decode(decrypted);
    }

    /**
     * Wait for binary message.
     *
     * @returns The received message
     */
    public async waitForBinaryMessage(timeout: number = -1): Promise<Uint8Array> {
        return this.decryptMessage(await this.webSocketPB.waitForBinaryMessage(timeout));
    }

    // ######## Private API - nonce management ########

    /**
     * Encrypt the message using the shared key.
     *
     * @param plainText - The text to encrypt
     * @returns The encrypted text
     */
    private encryptMessage(plainText: Uint8Array): Uint8Array {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const nonce = this.getAndIncLocalNonce();
        return tweetnacl.box.after(plainText, nonce, this.sharedKey);
    }

    /**
     * Decrypt the cypher text using the shared key.
     *
     * @param cypherText - The text to decrypt
     * @returns The decrypted text
     */
    private decryptMessage(cypherText: Uint8Array): Uint8Array {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const nonce = this.getAndIncRemoteNonce();
        const plainText = tweetnacl.box.open.after(cypherText, nonce, this.sharedKey);
        if (!plainText) {
            this.close();
            throw new Error('Decryption of message failed.');
        }
        return plainText;
    }

    /**
     * Returns and then increases the local nonce counter.
     *
     * @returns
     */
    private getAndIncLocalNonce(): Uint8Array {
        const nonce = EncryptedConnection.nonceCounterToArray(this.localNonceCounter);
        this.localNonceCounter += 2;
        return nonce;
    }

    /**
     * Returns and then increases the remote nonce counter.
     *
     * @returns
     */
    private getAndIncRemoteNonce(): Uint8Array {
        const nonce = EncryptedConnection.nonceCounterToArray(this.remoteNonceCounter);
        this.remoteNonceCounter += 2;
        return nonce;
    }

    /**
     * Converts the nonce counter from number to Uint8Array.
     *
     * The highest supported nonce counter value is Number.MAX_SAFE_INTEGER - 2
     *
     * Public for tests.
     */
    public static nonceCounterToArray(nonceNumber: number): Uint8Array {
        const nonce = new Uint8Array(tweetnacl.box.nonceLength);
        const view = new DataView(nonce.buffer);

        // We need to check that the nonce counter doesn't become too large,
        // otherwise already used nonces might happen.
        // This only happens after 2^53 / 2 message ... which will never happen ...
        // but people need to be aware that duplicate nonces are bad.
        if (nonceNumber >= Number.MAX_SAFE_INTEGER - 1) {
            throw new Error('Nonce counter reached its maximum value.');
        }

        // Set the lowest bits of the nonce array in big endian notation.
        // "- 8", because the setBigUint64 will set 8 bytes. This means that if
        // nonce.length is 24, then bytes 16, 17, 18, 19, 20, 21, 22, 23 will be set.
        view.setBigUint64(nonce.length - 8, BigInt(nonceNumber));
        return nonce;
    }
}

export default EncryptedConnection;
