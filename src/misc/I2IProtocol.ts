declare module I2IProtocol {

    /**
     * This request is sent by a client to request communication with somebody that has the specified public key.
     *
     * This is exactly the same message that is initially sent for connections not going
     * through the communication server, so it will be received by the communication server
     * to determine with whom to establish the connection. And it will also be forwarded by the
     * communication server to the registered client so that the direct connection behaves the same
     * from the point ov view of the reuqesting client.
     */
    export type CommunicationRequestMessage = {
        command: 'communication_request';
        sourcePublicKey: Uint8Array;
        targetPublicKey: Uint8Array;
    };

    /**
     * Accepts the connection request.
     */
    export type CommunicationAcceptMessage = {
        command: 'communication_accept';
    };

    export interface ClientMessages {
        communication_request: CommunicationRequestMessage;
    }
    export interface ServerMessages {
        communication_accept: CommunicationAcceptMessage;
    }

    export type ClientMessageTypes = ClientMessages[keyof ClientMessages];
    export type ServerMessageTypes = ServerMessages[keyof ServerMessages];
}

/**
 * Check the content of an object against available messages.
 *
 * @param {any} arg - the argument to check
 * @param {string} command - the command of the message to check against
 */
export function isClientMessage<T extends keyof I2IProtocol.ClientMessages>(
    arg: any,
    command: T
): arg is I2IProtocol.ClientMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'communication_request') {
        return (arg.sourcePublicKey !== undefined) && (arg.targetPublicKey !== undefined);
    }
    return false;
}

/**
 * Check the content of an object against available messages.
 *
 * @param {any} arg - the argument to check
 * @param {string} command - the command of the message to check against
 */
export function isServerMessage<T extends keyof I2IProtocol.ServerMessages>(
    arg: any,
    command: T
): arg is I2IProtocol.ServerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'communication_accept') {
        return true;
    }
    return false;
}

export default I2IProtocol;
