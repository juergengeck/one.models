import WebSocket from 'ws';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import CommunicationServerProtocol, {isClientMessage} from './CommunicationServerProtocol';
import {fromByteArray, toByteArray} from 'base64-js';
import {wslogId} from './LogUtils';
import {createMessageBus} from 'one.core/lib/message-bus';

const MessageBus = createMessageBus('CommunicationServerConnection_Server');

/**
 * This class implements the server side of communication server communication.
 */
class CommunicationServerConnection_Server {
    public webSocketPB: WebSocketPromiseBased; // The websocket used for communication
    private isPinging: boolean = false; // State that indicates if the ping process is running
    private isWaitingForPong: boolean = false; // Valie that is true while we wait for a pong
    private resolveStopPing: (() => void) | null = null; // Resolve handler for stop function whil waiting for a pong
    private pingTimeoutHandle: ReturnType<typeof setTimeout> | null = null; // Ping timout handle for cancellation in stop

    /**
     * Creates a server connection based on a WebSocket object
     *
     * @param {WebSocket} ws - The websocket used for communication
     */
    constructor(ws: WebSocket) {
        this.webSocketPB = new WebSocketPromiseBased(ws);
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

    // ######## Message sending ########

    /**
     * Send authentication request message.
     *
     * @param publicKey - the publicKey of the commserver
     * @param challenge - the challenge that has to be decrypted by the receiver
     *                    and sent back in an authentication response message
     */
    public async sendAuthenticationRequestMessage(
        publicKey: Uint8Array,
        challenge: Uint8Array
    ): Promise<void> {
        await this.sendMessage({command: 'authentication_request', publicKey, challenge});
    }

    /**
     * Send the authentication success message.
     *
     * @returns {Promise<void>}
     */
    public async sendAuthenticationSuccessMessage(pingInterval: number): Promise<void> {
        await this.sendMessage({command: 'authentication_success', pingInterval});
    }

    /**
     * Send the connection handover message.
     *
     * @returns {Promise<void>}
     */
    public async sendConnectionHandoverMessage(): Promise<void> {
        await this.sendMessage({command: 'connection_handover'});
    }

    /**
     * Send Ping Message
     */
    public async sendPingMessage(): Promise<void> {
        await this.sendMessage({command: 'comm_ping'});
    }

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
        await this.sendMessage({
            command: 'communication_request',
            sourcePublicKey,
            targetPublicKey
        });
    }

    /**
     * Starts pinging the client.
     *
     * @param {number} pingInterval - Interval since last pong when to send another ping.
     * @param {number} pongTimeout - Time to wait for the pong (after a ping) before severing the connection.
     */
    public startPingPong(pingInterval: number, pongTimeout: number): void {
        MessageBus.send(
            'debug',
            `${wslogId(this.webSocket)}: startPingPong(${pingInterval}, ${pongTimeout})`
        );

        if (this.isPinging) {
            throw new Error('Already ping / ponging');
        }
        this.isPinging = true;

        // Sends the ping. This is a wrapper for async
        const sendPing = async () => {
            try {
                // If not pinging anymore, because stopPingPing was called
                // Then resolve the waiter in stopPingPong and don't schedule another ping
                if (!this.isPinging) {
                    if (this.resolveStopPing) {
                        this.resolveStopPing();
                    }
                    return;
                }

                // Send ping and wait for pong
                let pongTimeoutHandler: ReturnType<typeof setTimeout> | null = null;
                try {
                    // Send a ping
                    this.isWaitingForPong = true;
                    await this.sendPingMessage();

                    // Set a timeout for the pong
                    pongTimeoutHandler = setTimeout(() => {
                        this.close('Pong Timeout');
                    }, pongTimeout);

                    // Wait for the message
                    await this.waitForMessage('comm_pong');

                    // Cancel timeout
                    this.isWaitingForPong = false;
                    clearTimeout(pongTimeoutHandler);

                    // If stop is waiting, resolve the promise
                    if (this.resolveStopPing) {
                        this.resolveStopPing();
                    }
                } catch (e) {
                    // Cancel timeout
                    this.isWaitingForPong = false;
                    if (pongTimeoutHandler) {
                        clearTimeout(pongTimeoutHandler);
                    }

                    // If stop is waiting, resolve the promise
                    if (this.resolveStopPing) {
                        this.resolveStopPing();
                    }
                    throw e;
                }

                // Reschedule another ping
                if (this.isPinging) {
                    this.pingTimeoutHandle = setTimeout(() => {
                        this.pingTimeoutHandle = null;
                        sendPing();
                    }, pingInterval);
                }
            } catch (e) {
                this.close();
                if (this.resolveStopPing) {
                    this.resolveStopPing();
                }
            }
        };

        // Send the first ping
        sendPing();
    }

    /**
     * Stops the ping / pong process.
     *
     * If currently waiting for a pong, then the promise resolves
     * 1) After the pong was received
     * 2) After the pong timeout was reached
     *
     * @returns {Promise<void>}
     */
    public async stopPingPong(): Promise<void> {
        MessageBus.send('log', `${wslogId(this.webSocket)}: stopPingPong()`);
        if (this.resolveStopPing) {
            throw new Error('Somebody else already requested stopping ping / pong.');
        }
        if (!this.isPinging) {
            return;
        }

        // Wait if in a ping / pong cycle, otherwise just resolve
        await new Promise(resolve => {
            // Cancel the next ping if it is scheduled
            this.isPinging = false;
            if (this.pingTimeoutHandle) {
                clearTimeout(this.pingTimeoutHandle);
            }

            // Wait for pong (or error) if currently in a ping / pong cycle
            if (this.isWaitingForPong) {
                this.resolveStopPing = resolve;
            }

            // Resolve immediately if not in a ping / pong cycle.
            else {
                resolve();
            }
        });

        this.resolveStopPing = null;
    }

    // ######## Message receiving ########

    /**
     * Wait for an arbitrary client message.
     *
     * @returns {Promise<CommunicationServerProtocol.ClientMessageTypes>}
     */
    public async waitForAnyMessage(): Promise<CommunicationServerProtocol.ClientMessageTypes> {
        const message = this.unpackBinaryFields(await this.webSocketPB.waitForJSONMessage());
        if (isClientMessage(message, message.command)) {
            return message;
        }
        throw Error('Received data does not match the data of a client message.');
    }

    /**
     * Wait for a client message with certain type.
     *
     * @param {T} command - expected command of message.
     * @returns {Promise<CommunicationServerProtocol.ClientMessages[T]>}
     */
    public async waitForMessage<T extends keyof CommunicationServerProtocol.ClientMessages>(
        command: T
    ): Promise<CommunicationServerProtocol.ClientMessages[T]> {
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
     * Send a message to the communication server client.
     *
     * @param {T} message - The message to send.
     * @returns {Promise<void>}
     */
    private async sendMessage<T extends CommunicationServerProtocol.ServerMessageTypes>(
        message: T
    ): Promise<void> {
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
    public unpackBinaryFields(message: any): any {
        if (typeof message.command !== 'string') {
            throw Error(`Parsing message failed!`);
        }

        // Transform the Uint8Array fields of authentication_request
        if (message.command === 'register') {
            if (message.publicKey && typeof message.publicKey === 'string') {
                message.publicKey = toByteArray(message.publicKey);
            }
        }
        if (message.command === 'authentication_response') {
            if (message.response && typeof message.response === 'string') {
                message.response = toByteArray(message.response);
            }
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

export default CommunicationServerConnection_Server;
