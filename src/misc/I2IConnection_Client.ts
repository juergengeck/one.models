import WebSocket from 'ws';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import I2IProtocol, {isServerMessage} from './I2IProtocol';
import {fromByteArray} from 'base64-js';

/**
 * This class implements the client side of communication server communication
 */
class I2IConnection_Client {
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

    public async waitForMessage<T extends keyof I2IProtocol.ServerMessages>(
        command: T
    ): Promise<I2IProtocol.ServerMessages[T]> {
        const message = this.unpackBinaryFields(
            await this.webSocketPB.waitForJSONMessageWithType(command, 'command')
        );
        if (isServerMessage(message, command)) {
            return message;
        }
        throw Error("Received data does not match the data expected for command '" + command + "'");
    }

    // ######## Private ########

    /**
     * Send a message to the communication server.
     *
     * @param message
     */
    private async sendMessage<T extends I2IProtocol.ClientMessageTypes>(message: T): Promise<void> {
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

        return message;
    }
}

export default I2IConnection_Client;
