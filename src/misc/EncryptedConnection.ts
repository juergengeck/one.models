import WebSocketPromiseBased from './WebSocketPromiseBased';
import WebSocket from 'ws';
import tweetnacl from 'tweetnacl';

/**
 * This class implements an encrypted connection.
 *
 * The key negotiation is done by derived classes, because depending on the
 * side of the conversation (client: initiator of the connection / server:
 * acceptor of the connection) the key exchange procedure changes.
 */
class EncryptedConnection {
    public webSocketPB: WebSocketPromiseBased; // Websocket used for communication
    protected sharedKey: Uint8Array | null = null; // The shared key used for encryption
    private localNonceCounter: number = 0; // The counter for the local nonce
    private remoteNonceCounter: number = 0; // The counter for the remote nonce
    private readonly maxNonceCounter: number = 0; // Maximum value nonces are allowed to have

    /**
     * Creates an encryption layer above the passed websocket.
     *
     * Instantiating this class is not enough. The shared key pairs have to be set up
     * by a derived class through some kind of key negotiation procedure before the encryption
     * actually works.
     *
     * @param {WebSocket} ws - The websocket that is used to exchange encrypted messages.
     * @param {boolean} evenLocalNonceCounter - If true the local instance uses even nonces, otherwise odd.
     */
    constructor(ws: WebSocket, evenLocalNonceCounter: boolean) {
        this.webSocketPB = new WebSocketPromiseBased(ws);

        // Calculate the maximum nonce counter, so that we can throw an exception
        // if we reached the end of the nonce counting. This will be 2^(nonceLength*8)-2
        let nonceMax = 0xfe;
        for (let i = 1; i < tweetnacl.box.nonceLength; ++i) {
            nonceMax |= 0xff << (i * 8);
        }
        this.maxNonceCounter = nonceMax;

        // Setup the initial nonce related values
        if (evenLocalNonceCounter) {
            this.localNonceCounter = 0;
            this.remoteNonceCounter = 1;
        } else {
            this.localNonceCounter = 1;
            this.remoteNonceCounter = 0;
        }
    }

    // ######## Socket Management & Settings ########

    /**
     * Get the underlying web socket instance
     *
     * @returns {WebSocket}
     */
    get webSocket(): WebSocket {
        if (!this.webSocketPB.webSocket) {
            throw new Error('No Websocket is assigned to connection.');
        }
        return this.webSocketPB.webSocket;
    }

    /**
     * Releases the underlying websocket, so that it can be used by another class.
     */
    public releaseWebSocket(): WebSocket {
        return this.webSocketPB.releaseWebSocket();
    }

    /**
     * Closes the web socket.
     *
     * @param {string} reason - The reason for closing. If specified it is sent unencrypted to the remote side!
     */
    public close(reason?: string): void {
        return this.webSocketPB.close(reason);
    }

    /**
     * Set the request timeout.
     *
     * This timeout specifies how long the connection will wait for new messages in the wait* methods.
     *
     * @param {number} timeout - The new timeout. -1 means forever, > 0 is the time in ms.
     */
    set requestTimeout(timeout: number) {
        this.webSocketPB.defaultTimeout = timeout;
    }

    /**
     * Get the current request timeout.
     *
     * @returns {number}
     */
    get requestTimeout(): number {
        return this.webSocketPB.defaultTimeout;
    }

    // ######## Sending encrypted messages ########

    /**
     * Send string data encrypted.
     *
     * @param {string} data - The data to send over the encrypted channel
     * @returns {Promise<void>}
     */
    public async sendMessage(data: string): Promise<void> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const textEncoder = new TextEncoder();
        const encrypted = tweetnacl.box.after(
            textEncoder.encode(data),
            this.getAndIncLocalNonce(),
            this.sharedKey
        );
        await this.webSocketPB.send(encrypted);
    }

    /**
     * Send binary data encrypted.
     *
     * @param {Uint8Array} data - The data to send over the encrypted channel
     * @returns {Promise<void>}
     */
    public async sendBinaryMessage(data: Uint8Array): Promise<void> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const encrypted = tweetnacl.box.after(data, this.getAndIncLocalNonce(), this.sharedKey);
        await this.webSocketPB.send(encrypted);
    }

    // ######## Receiving encrypted messages ########

    /**
     * Wait for string message.
     *
     * @returns {Promise<string>} The received message
     */
    public async waitForMessage(): Promise<string> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const decrypted = tweetnacl.box.after(
            await this.webSocketPB.waitForBinaryMessage(),
            this.getAndIncRemoteNonce(),
            this.sharedKey
        );
        const decoder = new TextDecoder();
        const decoded = decoder.decode(decrypted);
        return decoded;
    }

    /**
     * Wait for binary message.
     *
     * @returns {Promise<string>} The received message
     */
    public async waitForBinaryMessage(): Promise<Uint8Array> {
        if (!this.sharedKey) {
            throw Error('The encryption keys have not been set up correctly.');
        }

        const decrypted = tweetnacl.box.after(
            await this.webSocketPB.waitForBinaryMessage(),
            this.getAndIncRemoteNonce(),
            this.sharedKey
        );
        if (!(decrypted instanceof ArrayBuffer)) {
            throw Error('Received message was not binary');
        }
        return decrypted;
    }

    // ######## Private API - nonce management ########

    /**
     * Returns and then increases the local nonce counter.
     *
     * @returns {Uint8Array}
     */
    private getAndIncLocalNonce(): Uint8Array {
        const nonce = EncryptedConnection.nonceCounterToArray(this.localNonceCounter);
        if (this.localNonceCounter >= this.maxNonceCounter) {
            throw Error('Remote nonce counter reached its maximum value.');
        }
        this.localNonceCounter += 2;
        return nonce;
    }

    /**
     * Returns and then increases the remote nonce counter.
     *
     * @returns {Uint8Array}
     */
    private getAndIncRemoteNonce(): Uint8Array {
        const nonce = EncryptedConnection.nonceCounterToArray(this.remoteNonceCounter);
        if (this.remoteNonceCounter >= this.maxNonceCounter) {
            throw Error('Remote nonce counter reached its maximum value.');
        }
        this.remoteNonceCounter += 2;
        return nonce;
    }

    /**
     * Converts the nonce counter from number to Uint8Array.
     *
     * @returns {Uint8Array}
     */
    private static nonceCounterToArray(nonceNumber: number): Uint8Array {
        const nonce = new Uint8Array(tweetnacl.box.nonceLength);
        if (nonce.length > 4) {
            throw Error('The createNonceArray function only supports up to 32-bit for now.');
        }
        for (let i = 0; i < nonce.length; ++i) {
            nonce[i] = (nonceNumber >> (i * 8)) & 0xff;
        }
        return nonce;
    }
}

export default EncryptedConnection;
