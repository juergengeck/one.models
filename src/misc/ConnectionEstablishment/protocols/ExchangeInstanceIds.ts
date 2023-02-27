import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type Connection from '../../Connection/Connection';
import type {Instance} from '@refinio/one.core/lib/recipes';
import {sendPeerMessage, waitForPeerMessage} from './CommunicationInitiationProtocolMessages';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object';
import {getIdObject} from '@refinio/one.core/lib/storage-versioned-objects';

export type InstanceId = Pick<Instance, '$type$' | 'name' | 'owner'>;

/**
 * Exchange instance-id objects with the other side.
 *
 * @param conn
 * @param localInstanceId
 */
export async function exchangeInstanceIdObjects(
    conn: Connection,
    localInstanceId: SHA256IdHash<Instance>
): Promise<{
    localInstanceId: SHA256IdHash<Instance>;
    localInstanceIdObject: InstanceId;
    remoteInstanceId: SHA256IdHash<Instance>;
    remoteInstanceIdObject: InstanceId;
}> {
    const localInstanceIdObject = await getIdObject(localInstanceId);
    sendPeerMessage(conn, {
        command: 'instance_id_object',
        obj: localInstanceIdObject
    });
    const remoteInstanceIdObject = (await waitForPeerMessage(conn, 'instance_id_object')).obj;
    const remoteInstanceId = await calculateIdHashOfObj(remoteInstanceIdObject);

    return {
        localInstanceId,
        localInstanceIdObject,
        remoteInstanceId,
        remoteInstanceIdObject
    };
}
