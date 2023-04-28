import type {Person} from '@refinio/one.core/lib/recipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type Connection from '../../Connection/Connection';
import type {AccessibleObject} from './Debug/determineAccessibleHashes';
import {determineAccessibleObjects} from './Debug/determineAccessibleHashes';

export async function acceptDebugRequest(
    conn: Connection,
    remotePersonId: SHA256IdHash<Person>
): Promise<void> {
    const protocol = await waitForDebugMessage(conn, 'start_protocol');

    if (protocol.protocol === 'getAccessibleObjects') {
        if (protocol.version !== '1.0') {
            conn.close('Protocol version not supported. Only 1.0 is supported');
            return;
        }

        const accessibleObjects = await determineAccessibleObjects(remotePersonId);

        sendDebugMessage(conn, {
            type: 'accessible_objects',
            objects: accessibleObjects
        });

        conn.close('Debug protocol "getAccessibleObjects" finished');
    }
}

export async function requestAcccessibleObjects(conn: Connection): Promise<AccessibleObject[]> {
    sendDebugMessage(conn, {
        type: 'start_protocol',
        protocol: 'getAccessibleObjects',
        version: '1.0'
    });

    const accessibleObjectsMessage = await waitForDebugMessage(conn, 'accessible_objects');
    return accessibleObjectsMessage.objects;
}

// #### Low level protocol / messages ... ####

type DebugProtocols = 'getAccessibleObjects';

type StartProtocolMessage = {
    type: 'start_protocol';
    protocol: DebugProtocols;
    version: string;
};

type AccessibleObjectsMessage = {
    type: 'accessible_objects';
    objects: AccessibleObject[];
};

export interface DebugMessages {
    start_protocol: StartProtocolMessage;
    accessible_objects: AccessibleObjectsMessage;
}

export type DebugMessageTypes = DebugMessages[keyof DebugMessages];

/**
 * Check whether the argument is a debug message of specified type.
 *
 * @param arg - The argument to check
 * @param type - The type of the message to check against.
 */
export function isDebugMessage<T extends keyof DebugMessages>(
    arg: any,
    type: T
): arg is DebugMessages[T] {
    if (arg.command !== type) {
        return false;
    }

    if (type === 'start_protocol') {
        return arg.protocol === 'getAccessibleObjects' && typeof arg.version === 'string';
    }

    return false;
}

/**
 * Send a debug message
 *
 * @param conn
 * @param message - The message to send
 */
export function sendDebugMessage<T extends DebugMessageTypes>(conn: Connection, message: T): void {
    conn.send(JSON.stringify(message));
}

/**
 * Wait for a debug message
 *
 * @param conn
 * @param type - the command to wait for
 * @returns
 */
export async function waitForDebugMessage<T extends keyof DebugMessages>(
    conn: Connection,
    type: T
): Promise<DebugMessages[T]> {
    const message = await conn.promisePlugin().waitForJSONMessageWithType(type);

    if (isDebugMessage(message, type)) {
        return message;
    }

    throw Error(`Received data does not match the data expected for message type "${type}"`);
}
