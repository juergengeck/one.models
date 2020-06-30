import WebSocket from 'ws';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import CommunicationServerProtocol, {isServerMessage} from './CommunicationServerProtocol';
import {fromByteArray, toByteArray} from 'base64-js';

/**
 * This class implements the client side of communication server communication
 */
class CommunicationServerConnection_Client {
    public webSocketPB: WebSocketPromiseBased;

    /**
     * Creates a client connection to a communication server for registering connection listeners.
     *
     * @param url
     */
    constructor(url: string) {
        this.webSocketPB = new WebSocketPromiseBased(new WebSocket(url));
    }

    // ######## Socket Management & Settings ########

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

    public close(reason?: string): void {
        return this.webSocketPB.close(reason);
    }

    set requestTimeout(timeout: number) {
        this.webSocketPB.defaultTimeout = timeout;
    }

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

    /**
     * Send the communication request message
     *
     * This shouldn't be used by the client. Instead a I2I communication protocol
     * should have the same message, because the communication server should be transparent.
     *
     * @param {Uint8Array} sourcePublicKey
     * @param {Uint8Array} targetPublicKey
     * @returns {Promise<void>}
     */
    public async sendCommunicationRequestMessage(
        sourcePublicKey: Uint8Array,
        targetPublicKey: Uint8Array
    ): Promise<void> {
        await this.sendMessage({command: 'communication_request', sourcePublicKey, targetPublicKey});
    }

    // ######## Message receiving ########

    public async waitForMessage<T extends keyof CommunicationServerProtocol.ServerMessages>(
        command: T
    ): Promise<CommunicationServerProtocol.ServerMessages[T]> {
        const message = this.unpackBinaryFields(await this.webSocketPB.waitForJSONMessageWithType(command, 'command'));
        if (isServerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

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
                const message = this.unpackBinaryFields(await this.webSocketPB.waitForJSONMessage());

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
                        "Received data does not match the data expected for command '" + command + "'"
                    );
                }
            }
        }

        // Cancel the ping timeout e.g. on error (e.g. when the connection closes)
        catch(e) {
            cancelPingTimeout();
            throw e;
        }
    }

    // ######## Private ########

    /**
     * Send a message to the communication server.
     *
     * @param message
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
