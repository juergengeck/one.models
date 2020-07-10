import CommunicationInitiationProtocol from "./CommunicationInitiationProtocol";

/**
 * Protocol that defines messages used for communication between communication server and registering clients.
 */
declare module CommunicationServerProtocol {

    // ######## Message / command definition ########

    /**
     * Registers a listening connection at the comm server.
     */
    export type RegisterMessage = {
        command: 'register';
        publicKey: Uint8Array;
    };

    /**
     * Requests authentication from the client that is registering.
     */
    export type AuthenticationRequestMessage = {
        command: 'authentication_request';
        publicKey: Uint8Array;
        challenge: Uint8Array;
    };

    /**
     * Authentication message from the client.
     */
    export type AuthenticationResponseMessage = {
        command: 'authentication_response';
        response: Uint8Array;
    };

    /**
     * Confirmation of successful authentication.
     *
     * If authentication was not successful, the connection is just severed.
     */
    export type AuthenticationSuccessMessage = {
        command: 'authentication_success';
        pingInterval: number;
    };

    /**
     * Signals that an incoming connection is handed over to a registered cient.
     */
    export type ConnectionHandoverMessage = {
        command: 'connection_handover';
    };

    /**
     * Ping message used for keeping alive spare registered connections.
     */
    export type PingMessage = {
        command: 'comm_ping';
    };

    /**
     * Pong messages used for keeping alive spare registered connections.
     */
    export type PongMessage = {
        command: 'comm_pong';
    };

    // ######## Message to Role (Client / Server) Mapping ########

    /**
     * Those are messages that are sent by the comm server client.
     */
    export interface ClientMessages {
        register: RegisterMessage;
        authentication_response: AuthenticationResponseMessage;
        comm_pong: PongMessage;
        communication_request: CommunicationInitiationProtocol.CommunicationRequestMessage;
    }

    /**
     * Those are messages that are sent by the comm server.
     */
    export interface ServerMessages {
        authentication_request: AuthenticationRequestMessage;
        authentication_success: AuthenticationSuccessMessage;
        connection_handover: ConnectionHandoverMessage;
        comm_ping: PingMessage;
        communication_request: CommunicationInitiationProtocol.CommunicationRequestMessage;
    }

    export type ClientMessageTypes = ClientMessages[keyof ClientMessages];
    export type ServerMessageTypes = ServerMessages[keyof ServerMessages];
}

/**
 * Check whether the argument is a client message of specified type / command.
 *
 * @param arg - The argument to check
 * @param {T} command - The command / type of the message to check against.
 * @returns {arg is CommunicationServerProtocol.ClientMessages[T]}
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
 * Check whether the argument is a server message of specified type / command.
 *
 * @param arg - The argument to check
 * @param {T} command - The command / type of the message to check against.
 * @returns {arg is CommunicationServerProtocol.ServerMessages[T]}
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