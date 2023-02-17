import type {PublicKey} from '../../../../one.core/lib/crypto/encryption';
import type Connection from '../Connection/Connection';
import type ConnectionRoute from './routes/ConnectionRoute';

export type ConnectionRoutes = {route: ConnectionRoute; disabled: boolean}[];

export type ConnectionGroup = {
    // part of the map key
    connectionGroupName: string;
    localPublicKey: PublicKey;
    remotePublicKey: PublicKey;
    isCatchAllGroup: boolean;

    // Connection & routes
    activeConnection: Connection | null;
    activeConnectionRoute: ConnectionRoute | null;
    knownRoutes: ConnectionRoutes;

    // Internal stuff needed to handle reconnects and connection losses.
    dropDuplicates: boolean; // If this is true, duplicate connections will be dropped,
    closeHandler: (() => void) | null;
    disconnectCloseHandler: (() => void) | null;
    reconnectTimeoutHandle: ReturnType<typeof setTimeout> | null;
    dropDuplicatesTimeoutHandle: ReturnType<typeof setTimeout> | null;
};
