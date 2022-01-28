import type WebSocketPromiseBased from './WebSocketPromiseBased';
import CommunicationServerProtocol, {isClientMessage} from './CommunicationServerProtocol';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';

const MessageBus = createMessageBus('CommunicationServerConnection_Server');

/**
 * This class implements the server side of communication server communication.
 */
class CommunicationServerConnection_Server {
    public webSocketPB: WebSocketPromiseBased; // The websocket used for communication
    /**
     * Creates a server connection based on a WebSocket object
     *
     * @param ws - The websocket used for communication
     */
    constructor(ws: WebSocketPromiseBased) {
        this.webSocketPB = ws;
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
     * @param reason - The reason for closing. If specified it is sent unencrypted to the remote side!
     */
    public close(reason?: string): void {
        return this.webSocketPB.close(reason);
    }

    /**
     * Set the request timeout.
     *
     * This timeout specifies how long the connection will wait for new messages in the wait* methods.
     *
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
     */
    public async sendAuthenticationSuccessMessage(pingInterval: number): Promise<void> {
        await this.sendMessage({command: 'authentication_success', pingInterval});
    }

    /**
     * Send the connection handover message.
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
     * @param sourcePublicKey
     * @param targetPublicKey
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
    // ######## Message receiving ########

    /**
     * Wait for an arbitrary client message.
     *
     * @returns
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
     * @param command - expected command of message.
     * @returns
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
     * @param message - The message to send.
     */
    private async sendMessage<T extends CommunicationServerProtocol.ServerMessageTypes>(
        message: T
    ): Promise<void> {
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
     * @returns The converted message
     */
    public unpackBinaryFields(message: any): any {
        if (typeof message.command !== 'string') {
            throw Error(`Parsing message failed!`);
        }

        // Transform the Uint8Array fields of authentication_request
        if (message.command === 'register') {
            if (message.publicKey && typeof message.publicKey === 'string') {
                message.publicKey = uint8arrayToHexString(message.publicKey);
            }
        }
        if (message.command === 'authentication_response') {
            if (message.response && typeof message.response === 'string') {
                message.response = uint8arrayToHexString(message.response);
            }
        }
        if (message.command === 'communication_request') {
            if (message.sourcePublicKey && typeof message.sourcePublicKey === 'string') {
                message.sourcePublicKey = uint8arrayToHexString(message.sourcePublicKey);
            }
            if (message.targetPublicKey && typeof message.targetPublicKey === 'string') {
                message.targetPublicKey = uint8arrayToHexString(message.targetPublicKey);
            }
        }

        return message;
    }
}

export default CommunicationServerConnection_Server;
