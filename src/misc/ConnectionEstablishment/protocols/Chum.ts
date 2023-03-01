import {createChum} from '@refinio/one.core/lib/chum-sync';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {Instance} from '@refinio/one.core/lib/recipes';
import type {Person} from '@refinio/one.core/lib/recipes';
import {getIdObject} from '@refinio/one.core/lib/storage-versioned-objects';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {createWebsocketPromisifier} from '@refinio/one.core/lib/websocket-promisifier';

const MessageBus = createMessageBus('Protocols/StartChum');

/**
 * Starts the corresponding chum connection.
 *
 * @param conn
 * @param localPublicInstanceKey - This key is just used to get unique chum objects for
 * connections.
 * @param remotePublicInstanceKey - This key is just used to get unique chum objects for
 * connections.
 * @param localPersonId
 * @param remotePersonId
 * @param protocol
 * @param initiatedLocally
 * @param keepRunning
 */
import type Connection from '../../Connection/Connection';
import type {OEvent} from '../../OEvent';
import type {Protocols} from './CommunicationInitiationProtocolMessages';

export async function startChumProtocol(
    conn: Connection,
    localPersonId: SHA256IdHash<Person>,
    localInstanceId: SHA256IdHash<Instance>,
    remotePersonId: SHA256IdHash<Person>,
    remoteInstanceId: SHA256IdHash<Instance>,
    initiatedLocally: boolean,
    connectionRoutesGroupName: string,
    onProtocolStart: OEvent<
        (
            initiatedLocally: boolean,
            localPersonId: SHA256IdHash<Person>,
            localInstanceId: SHA256IdHash<Instance>,
            remotePersonId: SHA256IdHash<Person>,
            remoteInstanceId: SHA256IdHash<Instance>,
            protocol: Protocols
        ) => void
    >
) {
    onProtocolStart.emit(
        initiatedLocally,
        localPersonId,
        localInstanceId,
        remotePersonId,
        remoteInstanceId,
        'chum'
    );

    // Send synchronisation messages to make sure both instances start the chum at the same time.
    conn.send('synchronisation');
    await conn.promisePlugin().waitForMessage();
    conn.removePlugin('promise');

    // Core takes either the ws package or the default websocket
    // depending on for what environment it was compiled. In this
    // project we use the isomorphic-ws library for this. This is
    // why we need to ignore the below error, because after compilation
    // the types of the websockets will be the same.
    const websocketPromisifierAPI = createWebsocketPromisifier(conn);

    await createChum({
        connection: websocketPromisifierAPI,
        //TODO: localPersonId should be specified here
        remotePersonId,

        // used only for logging purpose
        chumName: connectionRoutesGroupName,
        localInstanceName: (await getIdObject(localInstanceId)).name,
        remoteInstanceName: (await getIdObject(remoteInstanceId)).name,

        keepRunning: true,
        maxNotificationDelay: 20
    }).promise;
}
