import EncryptedConnection_Client from './EncryptedConnection_Client';
import type EncryptedConnection from './EncryptedConnection';
import {createMessageBus} from 'one.core/lib/message-bus';
import {wslogId} from './LogUtils';
import {OEvent} from './OEvent';

const MessageBus = createMessageBus('OutgoingConnectionEstablisher');

/**
 * This class establishes outgoing connections.
 *
 * It retries establishing the connection until it is successful. (With a retry timeout)
 * After success it is dormant until another start() call happens.
 * Attempting to establish a connection is stopped when stop() is called.
 */
class OutgoingConnectionEstablisher {
    /**
     * Event is emitted on new connection.
     */
    public onConnection = new OEvent<
        (conn: EncryptedConnection, localPublicKey: Uint8Array, remotePublicKey: Uint8Array) => void
    >();

    private retryTimeoutHandle: {
        // Typescript got confused with NodeJS.Timeout as return value because lib.dom.d.ts
        // (TypeScript builtin) and timers.d.ts (@types/node) are in conflict. Disabling that TS
        // lib is not an option, a lot of errors appeared everywhere in the project when I tried.
        timer: null | ReturnType<typeof setTimeout> | number;
        reject: null | ((reason?: any) => void);
    } = {timer: null, reject: null};

    private stopped: boolean = true;

    /**
     * Used only when calling the connectOnceSuccessfully function.
     *
     * When the stop function is called will stop trying to establish a
     * connection and will reject the promise with a specific error.
     *
     * @type {((err: Error) => void) | null}
     * @private
     */
    private connectOnceSuccessfullyReject: ((err: Error) => void) | null = null;

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
                    const conn = await OutgoingConnectionEstablisher.connectOnce(
                        url,
                        myPublicKey,
                        targetPublicKey,
                        encrypt,
                        decrypt
                    );

                    // Notify the listener of a new connection
                    if (this.onConnection.listenerCount() > 0) {
                        this.onConnection.emit(conn, myPublicKey, targetPublicKey);
                        break;
                    }

                    if (this.stopped) {
                        break;
                    }
                } catch (e) {
                    if (this.stopped) {
                        break;
                    }

                    // TODO: If the timeout is canceled, this promise will not resolve!!!
                    await new Promise((resolve, reject) => {
                        this.retryTimeoutHandle.timer = setTimeout(resolve, retryTimeout);
                        this.retryTimeoutHandle.reject = reject;
                    });

                    this.retryTimeoutHandle.timer = null;
                    this.retryTimeoutHandle.reject = null;
                }
            }
        };

        // This catch should not be necessary. Apparently the catch above is not called.
        // TODO: It is a bug that the above catch is not called, so the connection will not be restarted ...
        // We should fix it somehow!
        makeAsync().catch(() => {});
    }

    /**
     * Stops the attempts to establish connections.
     *
     * @returns {Promise<void>}
     */
    public async stop() {
        MessageBus.send('log', `stop()`);
        this.stopped = true;

        const reason = 'Stopped by the user.';

        if (this.retryTimeoutHandle.timer !== null) {
            // Typescript got confused with lib.dom.d.ts vs. timers.d.ts types
            clearTimeout(this.retryTimeoutHandle.timer as number);
        }

        if (this.retryTimeoutHandle.reject !== null) {
            this.retryTimeoutHandle.reject(new Error(reason));
        }

        if (this.connectOnceSuccessfullyReject !== null) {
            this.connectOnceSuccessfullyReject(new Error(reason));
        }
    }

    /**
     * Establish a connection.
     *
     * Note: you cannot use the onConnection callback if you use this method!
     *
     * @param {string} url
     * @param {Uint8Array} myPublicKey
     * @param {Uint8Array} targetPublicKey
     * @param {(text: Uint8Array) => Uint8Array} encrypt
     * @param {(cypher: Uint8Array) => Uint8Array} decrypt
     * @param {number} retryTimeout
     * @param {number} successTimeout
     *
     * @returns {Promise<void>}
     */
    public connectOnceSuccessfully(
        url: string,
        myPublicKey: Uint8Array,
        targetPublicKey: Uint8Array,
        encrypt: (text: Uint8Array) => Uint8Array,
        decrypt: (cypher: Uint8Array) => Uint8Array,
        retryTimeout = 1000,
        successTimeout = 5000
    ): Promise<EncryptedConnection> {
        return new Promise((resolve, reject) => {
            // If the connection is successful, stop the oce and return the connection
            this.onConnection(conn => {
                // We need to remove the connectOnceSuccessfullyReject value before calling
                // the stop function, because the connection is successful and no error should
                // be thrown
                this.connectOnceSuccessfullyReject = null;
                this.stop()
                    .then(() => resolve(conn))
                    .catch(e => reject(e));
            });

            // On timeout reject the promise
            const timeoutHandle = setTimeout(() => {
                // The connectOnceSuccessfullyReject has to be set to null because the promise
                // is rejected with a different error and the stop function should have no effect
                // after this rejection
                this.connectOnceSuccessfullyReject = null;
                reject(new Error('Timeout reached'));
            }, successTimeout);

            // If stop is called while waiting for an outgoing connection, then we reject the promise
            this.connectOnceSuccessfullyReject = err => {
                this.connectOnceSuccessfullyReject = null;
                clearTimeout(timeoutHandle);
                reject(err);
            };

            this.start(url, myPublicKey, targetPublicKey, encrypt, decrypt, retryTimeout);
        });
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
    public static async connectOnce(
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
