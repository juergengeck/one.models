import EncryptedConnection_Client from './EncryptedConnection_Client';
import EncryptedConnection from './EncryptedConnection';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';

const MessageBus = createMessageBus('OutgoingConnectionEstablisher');

/**
 * This class establishes outgoing connections.
 *
 * It retries establishing the connection until it is successful. (With a retry timeout)
 * After success it is dormant until another start() call happens.
 * Attempting to establish a connection is stopped when stop() is called.
 */
class OutgoingConnectionEstablisher {
    public onConnection:
        | ((
              conn: EncryptedConnection,
              localPublicKey: Uint8Array,
              remotePublicKey: Uint8Array
          ) => void)
        | null = null;

    private retryTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    private stopped: boolean = true;

    /**
     * Creates new instance.
     */
    constructor() {}

    /**
     * Starts trying to establish a connection to the target.
     *
     * When successful, the onConnection handle is called. When not successful
     * another connection attempt is done after retryTimeout msecs.
     *
     * @param {string} url
     * @param {Uint8Array} myPublicKey
     * @param {Uint8Array} targetPublicKey
     * @param {(text: Uint8Array) => Uint8Array} encrypt
     * @param {(cypher: Uint8Array) => Uint8Array} decrypt
     * @param {number} retryTimeout
     */
    public start(
        url: string,
        myPublicKey: Uint8Array,
        targetPublicKey: Uint8Array,
        encrypt: (text: Uint8Array) => Uint8Array,
        decrypt: (cypher: Uint8Array) => Uint8Array,
        retryTimeout = 5000
    ): void {
        MessageBus.send('log', `start(${url})`);
        const makeAsync = async () => {
            this.stopped = false;

            while (true) {
                try {
                    // Try to establish a connection
                    const conn = await this.establishConnection(
                        url,
                        myPublicKey,
                        targetPublicKey,
                        encrypt,
                        decrypt
                    );
                    if (this.stopped) {
                        break;
                    }

                    // Notify the listener of a new connection
                    if (this.onConnection) {
                        this.onConnection(conn);
                        break;
                    }
                } catch (e) {
                    if (this.stopped) {
                        break;
                    }

                    await new Promise(resolve => {
                        this.retryTimeoutHandle = setTimeout(resolve, retryTimeout);
                    });
                    this.retryTimeoutHandle = null;
                }
            }
        };

        // This catch should not be necessary. Apparently the catch above is not called.
        // TODO: It is a bug that the above catch is not called, so the connection will not be restarted ...
        // We should fix it somehow!
        makeAsync().catch(() => {});
    }

    /**
     * Stops the attemts to establish connections.
     *
     * @returns {Promise<void>}
     */
    public async stop() {
        MessageBus.send('log', `stop()`);
        this.stopped = true;
        if (this.retryTimeoutHandle) {
            clearTimeout(this.retryTimeoutHandle);
        }
    }

    /**
     * Establish a connection.
     *
     * @param {string} url
     * @param {Uint8Array} myPublicKey
     * @param {Uint8Array} targetPublicKey
     * @param {(text: Uint8Array) => Uint8Array} encrypt
     * @param {(cypher: Uint8Array) => Uint8Array} decrypt
     * @returns {Promise<void>}
     */
    private async establishConnection(
        url: string,
        myPublicKey: Uint8Array,
        targetPublicKey: Uint8Array,
        encrypt: (text: Uint8Array) => Uint8Array,
        decrypt: (cypher: Uint8Array) => Uint8Array
    ): Promise<EncryptedConnection> {
        MessageBus.send('log', `establishConnection(${url})`);

        const conn = new EncryptedConnection_Client(url);
        await conn.webSocketPB.waitForOpen();

        // Request communication
        MessageBus.send('log', `${wslogId(conn.webSocket)}: send request`);
        await conn.sendCommunicationRequestMessage(myPublicKey, targetPublicKey);

        // Wait for accept message
        MessageBus.send('log', `${wslogId(conn.webSocket)}: send comm ready`);
        await conn.waitForUnencryptedMessage('communication_ready');

        // Setup encryption
        MessageBus.send('log', `${wslogId(conn.webSocket)}: exchange keys`);
        await conn.exchangeKeys(encrypt, decrypt);

        return conn;
    }
}

export default OutgoingConnectionEstablisher;
