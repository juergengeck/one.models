import WebSocket from 'isomorphic-ws';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import CommunicationServerProtocol, {isServerMessage} from './CommunicationServerProtocol';
import {fromByteArray, toByteArray} from 'base64-js';

/**
 * This class implements the client side of communication server communication
 */
class CommunicationServerConnection_Client {
    public webSocketPB: WebSocketPromiseBased; // The websocket used for the communication

    /**
     * Creates a client connection to a communication server for registering connection listeners.
     *
     * @param url
     */
    constructor(url: string) {
        this.webSocketPB = new WebSocketPromiseBased(new WebSocket(url));
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
     *
     * Attention: If messages arrive in the meantime they might get lost.
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
     * Send a register message to the communication server.
     *
     * @param {Uint8Array} publicKey
     * @returns {Promise<void>}
     */
    public async sendRegisterMessage(publicKey: Uint8Array): Promise<void> {
        await this.sendMessage({
            command: 'register',
            publicKey
        });
    }

    /**
     * Send response to authentication request message.
     *
     * @param {Uint8Array} response
     * @returns {Promise<void>}
     */
    public async sendAuthenticationResponseMessage(response: Uint8Array): Promise<void> {
        await this.sendMessage({
            command: 'authentication_response',
            response: response
        });
    }

    /**
     * Send Pong Message
     */
    public async sendPongMessage(): Promise<void> {
        await this.sendMessage({command: 'comm_pong'});
    }

    // ######## Message receiving ########

    /**
     * Wait for a message with the specified command.
     *
     * @param {T} command - The expected command of the next message
     * @returns {Promise<CommunicationServerProtocol.ServerMessages[T]>}
     */
    public async waitForMessage<T extends keyof CommunicationServerProtocol.ServerMessages>(
        command: T
    ): Promise<CommunicationServerProtocol.ServerMessages[T]> {
        const message = this.unpackBinaryFields(
            await this.webSocketPB.waitForJSONMessageWithType(command, 'command')
        );
        if (isServerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

    /**
     * Wait for a message with the specified command while also answering comm_pings.
     *
     * @param {T} command - The expected command of the next message
     * @param {number} pingTimeout - Pings in the given interval are expected. If pings do not arrive in this
     *                               time the connection is closed.
     * @returns {Promise<CommunicationServerProtocol.ServerMessages[T]>}
     */
    public async waitForMessagePingPong<T extends keyof CommunicationServerProtocol.ServerMessages>(
        command: T,
        pingTimeout: number
    ): Promise<CommunicationServerProtocol.ServerMessages[T]> {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        // Schedules a timeout at pingTimeout interval
        const schedulePingTimeout = () => {
            cancelPingTimeout();
            timeoutHandle = setTimeout(() => {
                this.webSocketPB.close('Ping timeout');
            }, pingTimeout);
        };

        // Cancels the ping timeout
        const cancelPingTimeout = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        };

        // Wait while answering pings for the requested message
        try {
            while (true) {
                // Schedule the ping timeout
                schedulePingTimeout();

                // Wait for new message
                const message = this.unpackBinaryFields(
                    await this.webSocketPB.waitForJSONMessage()
                );

                // On ping send a pong and reiterate the loop
                if (isServerMessage(message, 'comm_ping')) {
                    await this.sendPongMessage();
                }

                // On requested command return from this function
                else if (isServerMessage(message, command)) {
                    cancelPingTimeout();
                    return message;
                }

                // On unknown message throw
                else {
                    throw Error(
                        "Received data does not match the data expected for command '" +
                            command +
                            "'"
                    );
                }
            }
        } catch (e) {
            // Cancel the ping timeout e.g. on error (e.g. when the connection closes)
            cancelPingTimeout();
            throw e;
        }
    }

    // ######## Private ########

    /**
     * Send a message to the communication server.
     *
     * @param {T} message - The message to send
     * @returns {Promise<void>}
     */
    private async sendMessage<T extends CommunicationServerProtocol.ClientMessageTypes>(
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

        if (message.command === 'authentication_request') {
            if (message.publicKey && typeof message.publicKey === 'string') {
                message.publicKey = toByteArray(message.publicKey);
            }
            if (message.challenge && typeof message.challenge === 'string') {
                message.challenge = toByteArray(message.challenge);
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

export default CommunicationServerConnection_Client;
