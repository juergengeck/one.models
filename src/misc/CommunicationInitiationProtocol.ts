/**
 * Protocol that defines messages used to initiate communication / routing of connections.
 */
declare module CommunicationInitiationProtocol {
    // ######## Message / command definition ########

    /**
     * This request is sent by a client to request communication with somebody that has the specified public key.
     *
     * The target of this message can either be a communication server or an instance that accepts direct connections.
     */
    export type CommunicationRequestMessage = {
        command: 'communication_request';
        sourcePublicKey: Uint8Array;
        targetPublicKey: Uint8Array;
    };

    /**
     * This response is sent after the final target of the communication_request message is ready to process data.
     *
     * This message exists, because after the communication_request is sent, a routing to the target needs to be
     * established, and this can take some time. This command then signals that the routing has been established. If
     * the sender of the request would immediately start sending data after the communication_request, we
     * would have to be extra careful not to loose any data while the handover is taking place.
     *
     * In short: The communication_ready message is sent by the final destination to signal 'I am ready'.
     */
    export type CommunicationReadyMessage = {
        command: 'communication_ready';
    };

    /**
     * Message for exchanging person information like person id and keys.
     */
    export type PersonInformationMessage = {
        command: 'person_information';
        personId: string;
        personPublicKey: string;
    };

    // ######## Message to Role (Client / Server) Mapping ########

    /**
     * Those are messages that are sent by the initiator of the communication.
     */
    export interface ClientMessages {
        communication_request: CommunicationRequestMessage;
        person_information: PersonInformationMessage;
    }

    /**
     * Those are messages that are sent by the acceptor of the communication.
     */
    export interface ServerMessages {
        communication_ready: CommunicationReadyMessage;
    }

    /**
     * Those messages are sent by both peering partners (in a later stage both sides act as the same)
     */
    export interface PeerMessages {
        person_information: PersonInformationMessage;
    }

    export type ClientMessageTypes = ClientMessages[keyof ClientMessages];
    export type ServerMessageTypes = ServerMessages[keyof ServerMessages];
    export type PeerMessageTypes = PeerMessages[keyof PeerMessages];
}

/**
 * Check whether the argument is a client message of specified type / command.
 *
 * @param arg - The argument to check
 * @param {T} command - The command / type of the message to check against.
 * @returns {arg is CommunicationInitiationProtocol.ClientMessages[T]}
 */
export function isClientMessage<T extends keyof CommunicationInitiationProtocol.ClientMessages>(
    arg: any,
    command: T
): arg is CommunicationInitiationProtocol.ClientMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'communication_request') {
        return arg.sourcePublicKey !== undefined && arg.targetPublicKey !== undefined;
    }
    return false;
}

/**
 * Check whether the argument is a server message of specified type / command.
 *
 * @param arg - The argument to check
 * @param {T} command - The command / type of the message to check against.
 * @returns {arg is EncryptionSetupProtocol.ServerMessages[T]}
 */
export function isServerMessage<T extends keyof CommunicationInitiationProtocol.ServerMessages>(
    arg: any,
    command: T
): arg is CommunicationInitiationProtocol.ServerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'communication_ready') {
        return true;
    }
    return false;
}

/**
 * Check whether the argument is a peer message of specified type / command.
 *
 * @param arg - The argument to check
 * @param {T} command - The command / type of the message to check against.
 * @returns {arg is EncryptionSetupProtocol.ServerMessages[T]}
 */
export function isPeerMessage<T extends keyof CommunicationInitiationProtocol.PeerMessages>(
    arg: any,
    command: T
): arg is CommunicationInitiationProtocol.PeerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'person_information') {
        return arg.personId && arg.personPublicKey; // Make this better by checking for length of person id and it being a hash
    }
    return false;
}

export default CommunicationInitiationProtocol;