import CommunicationServerProtocol, {isServerMessage} from './CommunicationServerProtocol';
import {createWebSocket} from '@refinio/one.core/lib/system/websocket';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import PromisePlugin from './Connections/plugins/PromisePlugin';
import Connection from './Connections/Connection';

/**
 * This class implements the client side of communication server communication
 */
class CommunicationServerConnection_Client {
    public connection: Connection; // The websocket used for the communication

    /**
     * Creates a client connection to a communication server for registering connection listeners.
     *
     * @param url
     */
    constructor(url: string) {
        this.connection = new Connection(createWebSocket(url));
        this.connection.addPlugin(new PromisePlugin());
    }

    // ######## Socket Management & Settings ########

    /**
     * Get the underlying web socket instance
     *
     * @returns
     */
    get webSocket(): WebSocket {
        const webSocket = this.connection.websocketPlugin().webSocket;
        if (!webSocket) {
            throw new Error('No Websocket is assigned to connection.');
        }
        return webSocket;
    }

    /**
     * Releases the underlying websocket, so that it can be used by another class.
     *
     * Attention: If messages arrive in the meantime they might get lost.
     */
    public releaseWebSocket(): WebSocket {
        return this.connection.websocketPlugin().releaseWebSocket();
    }

    /**
     * Closes the websocket
     *
     * @param reason - The reason for closing. If specified it is sent unencrypted to the remote side!
     */
    public close(reason?: string): void {
        return this.connection.close(reason);
    }

    /**
     * Terminates the web socket.
     *
     * @param reason - The reason for closing. If specified it is sent unencrypted to the remote side!
     */
    public terminate(reason?: string): void {
        return this.connection.terminate(reason);
    }

    /**
     * Set the request timeout.
     *
     * This timeout specifies how long the connection will wait for new messages in the wait* methods.
     *
     * @param timeout - The new timeout. -1 means forever, > 0 is the time in ms.
     */
    /*set requestTimeout(timeout: number) {
        this.connection.defaultTimeout = timeout;
    }*/

    /**
     * Get the current request timeout.
     *
     * @returns
     */
    /*get requestTimeout(): number {
        return this.connection.defaultTimeout;
    }*/

    // ######## Message sending ########

    /**
     * Send a register message to the communication server.
     *
     * @param publicKey
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
     * @param response
     */
    public async sendAuthenticationResponseMessage(response: Uint8Array): Promise<void> {
        await this.sendMessage({
            command: 'authentication_response',
            response: response
        });
    }

    // ######## Message receiving ########

    /**
     * Wait for a message with the specified command.
     *
     * @param  command - The expected command of the next message
     * @returns
     */
    public async waitForMessage<T extends keyof CommunicationServerProtocol.ServerMessages>(
        command: T
    ): Promise<CommunicationServerProtocol.ServerMessages[T]> {
        const message = this.unpackBinaryFields(
            await this.connection.promisePlugin().waitForJSONMessageWithType(command, 'command')
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
     * @param message - The message to send
     */
    private async sendMessage<T extends CommunicationServerProtocol.ClientMessageTypes>(
        message: T
    ): Promise<void> {
        await this.connection.waitForOpen();
        await this.connection.send(
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

        if (message.command === 'authentication_request') {
            if (message.publicKey && typeof message.publicKey === 'string') {
                message.publicKey = hexToUint8Array(message.publicKey);
            }
            if (message.challenge && typeof message.challenge === 'string') {
                message.challenge = hexToUint8Array(message.challenge);
            }
        }
        if (message.command === 'communication_request') {
            if (message.sourcePublicKey && typeof message.sourcePublicKey === 'string') {
                message.sourcePublicKey = hexToUint8Array(message.sourcePublicKey);
            }
            if (message.targetPublicKey && typeof message.targetPublicKey === 'string') {
                message.targetPublicKey = hexToUint8Array(message.targetPublicKey);
            }
        }

        return message;
    }
}

export default CommunicationServerConnection_Client;
