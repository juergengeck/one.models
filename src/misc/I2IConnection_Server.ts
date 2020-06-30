import WebSocket from 'ws';
import WebSocketPromiseBased from './WebSocketPromiseBased';
import I2IProtocol, {isClientMessage} from './I2IProtocol';
import {fromByteArray, toByteArray} from 'base64-js';

/**
 * This class implements the client side of communication server communication
 */
class I2IConnetion_Server {
    public webSocketPB: WebSocketPromiseBased;

    /**
     * Creates a server connection based on a WebSocket object
     *
     * @param {WebSocket} ws - The websocket used for communication
     */
    constructor(ws: WebSocket) {
        this.webSocketPB = new WebSocketPromiseBased(ws);
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

    public async sendCommunicationAcceptMessage(): Promise<void> {
        await this.sendMessage({command: 'communication_accept'});
    }

    // ######## Message receiving ########

    public async waitForMessage<T extends keyof I2IProtocol.ClientMessages>(
        command: T
    ): Promise<I2IProtocol.ClientMessages[T]> {
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
     * Send a message to the communication server.
     *
     * @param message
     */
    private async sendMessage<T extends I2IProtocol.ServerMessageTypes>(message: T): Promise<void> {
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

export default I2IConnetion_Server;
