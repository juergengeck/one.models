/**
 * Protocol that defines messages used to initiate communication / routing of connections.
 */
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';

// TODO No extra namespace (the module already is one)
declare module CommunicationInitiationProtocol {
    // ######## Message / command definition ########

    /**
     * Protocols that are supported by the StartProtocolMessage
     */
    export type Protocols =
        | 'chum'
        | 'chum_onetimeauth_withtoken'
        | 'chumAndPkExchange_onetimeauth_withtoken'
        | 'chum_one_time'
        | 'accessGroup_set';

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
     * Message used by one side to tell the other side that a special protocol flow with a certain version shall be started.
     */
    export type StartProtocolMessage = {
        command: 'start_protocol';
        protocol: Protocols;
        version: string;
    };

    /**
     * Message for exchanging person information like person id and keys.
     */
    export type PersonInformationMessage = {
        command: 'person_information';
        personId: SHA256IdHash<Person>;
        personPublicKey: string;
    };

    /**
     * Message that transports a authentication tag.
     */
    export type AuthenticationTokenMessage = {
        command: 'authentication_token';
        token: string;
    };

    /**
     * Message that transports a authentication tag.
     */
    export type EncryptedAuthenticationTokenMessage = {
        command: 'encrypted_authentication_token';
        token: string;
    };

    /**
     * Message that transports a person object.
     */
    export type PersonObjectMessage = {
        command: 'person_object';
        obj: Person;
    };

    /**
     * Message for exchanging private person information like person id and private keys.
     */
    export type PrivatePersonInformationMessage = {
        command: 'private_person_information';
        personId: SHA256IdHash<Person>;
        personPublicKey: string;
        personPublicSignKey: string;
        personPrivateKey: string;
        personPrivateSignKey: string;
    };

    /**
     * Message that transports persons for access groups.
     */
    export type AccessGroupMembersMessage = {
        command: 'access_group_members';
        persons: string[]; // these are the emails of the person objects, so that we can build the person objects from scratch
    };

    /**
     * Just a message that signals success.
     */
    export type SuccessMessage = {
        command: 'success';
    };

    // ######## Message to Role (Client / Server) Mapping ########

    /**
     * Those are messages that are sent by the initiator of the communication.
     */
    export interface ClientMessages {
        communication_request: CommunicationRequestMessage;
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
        start_protocol: StartProtocolMessage;
        person_information: PersonInformationMessage;
        private_person_information: PrivatePersonInformationMessage;
        authentication_token: AuthenticationTokenMessage;
        encrypted_authentication_token: EncryptedAuthenticationTokenMessage;
        person_object: PersonObjectMessage;
        access_group_members: AccessGroupMembersMessage;
        success: SuccessMessage;
    }

    export type ClientMessageTypes = ClientMessages[keyof ClientMessages];
    export type ServerMessageTypes = ServerMessages[keyof ServerMessages];
    export type PeerMessageTypes = PeerMessages[keyof PeerMessages];
}

/**
 * Check whether the argument is a client message of specified type / command.
 *
 * @param arg - The argument to check
 * @param command - The command / type of the message to check against.
 * @returns
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
 * @param command - The command / type of the message to check against.
 * @returns
 */
export function isServerMessage<T extends keyof CommunicationInitiationProtocol.ServerMessages>(
    arg: any,
    command: T
): arg is CommunicationInitiationProtocol.ServerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    return command === 'communication_ready';
}

/**
 * Check whether the argument is a peer message of specified type / command.
 *
 * @param arg - The argument to check
 * @param command - The command / type of the message to check against.
 * @returns
 */
export function isPeerMessage<T extends keyof CommunicationInitiationProtocol.PeerMessages>(
    arg: any,
    command: T
): arg is CommunicationInitiationProtocol.PeerMessages[T] {
    if (arg.command !== command) {
        return false;
    }

    if (command === 'start_protocol') {
        return typeof arg.protocol === 'string' && typeof arg.version === 'string';
    }
    if (command === 'person_information') {
        return arg.personId && arg.personPublicKey; // Make this better by checking for length of person id and it being a hash
    }
    if (command === 'private_person_information') {
        return (
            typeof arg.personId === 'string' &&
            typeof arg.personPublicKey === 'string' &&
            typeof arg.personPublicSignKey === 'string' &&
            typeof arg.personPrivateKey === 'string' &&
            typeof arg.personPrivateSignKey === 'string' &&
            typeof arg.anonPersonId === 'string' &&
            typeof arg.anonPersonPublicKey === 'string' &&
            typeof arg.anonPersonPublicSignKey === 'string' &&
            typeof arg.anonPersonPrivateKey === 'string' &&
            typeof arg.anonPersonPrivateSignKey === 'string'
        );
    }
    if (command === 'authentication_token') {
        return typeof arg.token === 'string';
    }
    if (command === 'encrypted_authentication_token') {
        return typeof arg.token === 'string';
    }
    if (command === 'person_object') {
        return arg.obj && arg.obj.$type$ === 'Person';
    }
    if (command === 'access_group_members') {
        if (arg && arg.persons && Array.isArray(arg.persons)) {
            for (const person of arg.persons) {
                if (typeof person !== 'string') {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    return command === 'success';
}

export default CommunicationInitiationProtocol;
