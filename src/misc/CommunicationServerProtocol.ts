declare module CommunicationServerProtocol {
    export type RegisterMessage = {
        command: 'register';
        publicKey: Uint8Array;
    };

    export type AuthenticationRequestMessage = {
        command: 'authentication_request';
        publicKey: Uint8Array;
        challenge: Uint8Array;
    };

    export type AuthenticationResponseMessage = {
        command: 'authentication_response';
        response: Uint8Array;
    };

    export type AuthenticationSuccessMessage = {
        command: 'authentication_success';
        pingInterval: number;
    };

    export type ConnectionHandoverMessage = {
        command: 'connection_handover';
    };

    export type PingMessage = {
        command: 'comm_ping';
    };

    export type PongMessage = {
        command: 'comm_pong';
    };

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

    export interface ClientMessages {
        register: RegisterMessage;
        authentication_response: AuthenticationResponseMessage;
        comm_pong: PongMessage;
        communication_request: CommunicationRequestMessage;
    }

    export interface ServerMessages {
        authentication_request: AuthenticationRequestMessage;
        authentication_success: AuthenticationSuccessMessage;
        connection_handover: ConnectionHandoverMessage;
        comm_ping: PingMessage;
        communication_request: CommunicationRequestMessage;
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
export function isClientMessage<T extends keyof CommunicationServerProtocol.ClientMessages>(
    arg: any,
    command: T
): arg is CommunicationServerProtocol.ClientMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'register') {
        return arg.publicKey !== undefined;
    }
    if (command === 'authentication_response') {
        return arg.response !== undefined;
    }
    if (command === 'comm_pong') {
        return true;
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
export function isServerMessage<T extends keyof CommunicationServerProtocol.ServerMessages>(
    arg: any,
    command: T
): arg is CommunicationServerProtocol.ServerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'authentication_request') {
        return (arg.publicKey !== undefined) && (arg.challenge !== undefined);
    }
    if (command === 'authentication_success') {
        return arg.pingInterval !== undefined;
    }
    if (command === 'connection_handover') {
        return true;
    }
    if (command === 'comm_ping') {
        return true;
    }
    if (command === 'communication_request') {
        return (arg.sourcePublicKey !== undefined) && (arg.targetPublicKey !== undefined);
    }
    return false;
}

export default CommunicationServerProtocol;