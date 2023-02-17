/* eslint-disable @typescript-eslint/restrict-template-expressions */
import type {CryptoApi} from '../../../../one.core/lib/crypto/CryptoApi';
import {ensurePublicKey} from '../../../../one.core/lib/crypto/encryption';
import type {PublicKey} from '../../../../one.core/lib/crypto/encryption';
import type {SymmetricCryptoApiWithKeys} from '../../../../one.core/lib/crypto/SymmetricCryptoApi';
import IncomingConnectionManager from './IncomingConnectionManager';
import type {LocalPublicKey} from './ConnectionGroupMap';
import ConnectionGroupMap, {castToLocalPublicKey} from './ConnectionGroupMap';
import OutgoingWebsocketRoute from './routes/OutgoingWebsocketRoute';
import IncomingWebsocketRouteDirect from './routes/IncomingWebsocketRouteDirect';
import IncomingWebsocketRouteCommServer from './routes/IncomingWebsocketRouteCommServer';
import type Connection from '../Connection/Connection';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {ConnectionGroup, ConnectionRoutes} from './ConnectionGroup';
import {OEvent} from '../OEvent';
import {getOrCreate} from '../../utils/MapUtils';
import {exchangeConnectionGroupName} from './protocols/ExchangeConnectionGroupName';
import {sync} from './protocols/Sync';

const MessageBus = createMessageBus('CommunicatonModule');

export type CatchAllRoutes = {
    localPublicKey: LocalPublicKey;
    knownRoutes: ConnectionRoutes;
};

// ######## Configuration types ########

/**
 * This module manages incoming and outgoing connections.
 *
 * It will group certain connections together
 */
export default class ConnectionRouteManager {
    private readonly connectionGroupMap = new ConnectionGroupMap();
    private readonly catchAllRoutes = new Map<LocalPublicKey, CatchAllRoutes>();

    private readonly incomingConnectionManager = new IncomingConnectionManager();
    private readonly reconnectDelayOnClose: number;

    /**
     *  Event is emitted when the state of the connector changes. The event contains the value of the online state.
     */
    public onOnlineStateChange = new OEvent<(state: boolean) => void>();
    /**
     * Event is emitted when a connection is established or closed.
     */
    public onConnectionsChange = new OEvent<() => void>();

    public onConnection = new OEvent<
        (
            conn: Connection,
            localPublicKey: PublicKey,
            remotePublicKey: PublicKey,
            connectionGroupName: string,
            routeId: string,
            initiatedLocally: boolean
        ) => void
    >();

    public onConnectionViaCatchAll = new OEvent<
        (
            conn: Connection,
            localPublicKey: PublicKey,
            remotePublicKey: PublicKey,
            connectionGroupName: string,
            routeId: string,
            initiatedLocally: boolean
        ) => void
    >();

    /**
     * @param reconnectDelayOnClose - Real reconnect delay is randomized in the
     * intrval [reconnectDelay, reconnectInterval * 2]
     */
    constructor(reconnectDelayOnClose: number = 5000) {
        this.reconnectDelayOnClose = reconnectDelayOnClose;
        this.incomingConnectionManager.onConnection(
            (
                conn: Connection,
                localPublicKey: PublicKey,
                remotePublicKey: PublicKey,
                routeId: string
            ) => {
                this.acceptConnection(conn, localPublicKey, remotePublicKey, routeId).catch(
                    console.error
                );
            }
        );
        this.incomingConnectionManager.onOnlineStateChange((onlineState: boolean) => {
            this.onOnlineStateChange.emit(onlineState);
        });
    }

    get onlineState(): boolean {
        return this.incomingConnectionManager.onlineState;
    }

    // ######## add routes ########

    addOutgoingWebsocketRoute(
        cryptoApi: SymmetricCryptoApiWithKeys,
        url: string,
        connectionGroupName: string = 'default',
        reconnectDelay: number = 10000
    ): void {
        MessageBus.send(
            'log',
            `addOutgoingWebsocketConnection(${uint8arrayToHexString(
                cryptoApi.localPublicKey
            )}, ${uint8arrayToHexString(
                cryptoApi.remotePublicKey
            )}, ${url}, ${connectionGroupName})`
        );

        const connectionGroup = this.connectionGroupMap.entryCreateIfNotExist(
            cryptoApi.localPublicKey,
            cryptoApi.remotePublicKey,
            connectionGroupName,
            false
        );

        connectionGroup.knownRoutes.push({
            route: new OutgoingWebsocketRoute(
                url,
                reconnectDelay,
                cryptoApi,
                (
                    conn: Connection,
                    localPublicKeyInner: PublicKey,
                    remotePublicKeyInner: PublicKey,
                    routeId: string
                ) => {
                    this.acceptConnection(
                        conn,
                        localPublicKeyInner,
                        remotePublicKeyInner,
                        routeId,
                        connectionGroupName
                    ).catch(console.error);
                }
            ),
            disabled: true
        });
    }

    addIncomingWebsocketRoute_Direct(
        cryptoApi: CryptoApi,
        remotePublicKey: PublicKey,
        host: string,
        port: number,
        connectionGroupName: string = 'default'
    ): void {
        MessageBus.send(
            'log',
            `addIncomingWebsocketConnection_Direct(${uint8arrayToHexString(
                cryptoApi.publicEncryptionKey
            )}, ${uint8arrayToHexString(
                remotePublicKey
            )}, ${host}, ${port}, ${connectionGroupName})`
        );

        const connectionGroup = this.connectionGroupMap.entryCreateIfNotExist(
            cryptoApi.publicEncryptionKey,
            remotePublicKey,
            connectionGroupName,
            false
        );

        connectionGroup.knownRoutes.push({
            route: new IncomingWebsocketRouteDirect(
                this.incomingConnectionManager,
                host,
                port,
                cryptoApi
            ),
            disabled: true
        });
    }

    addIncomingWebsocketRoute_CommServer(
        cryptoApi: CryptoApi,
        remotePublicKey: PublicKey,
        commServerUrl: string,
        connectionGroupName: string = 'default'
    ): void {
        MessageBus.send(
            'log',
            `addIncomingWebsocketConnection_CommServer(${uint8arrayToHexString(
                cryptoApi.publicEncryptionKey
            )}, ${uint8arrayToHexString(
                remotePublicKey
            )}, ${commServerUrl}, ${connectionGroupName})`
        );

        const connectionGroup = this.connectionGroupMap.entryCreateIfNotExist(
            cryptoApi.publicEncryptionKey,
            remotePublicKey,
            connectionGroupName,
            false
        );

        connectionGroup.knownRoutes.push({
            route: new IncomingWebsocketRouteCommServer(
                this.incomingConnectionManager,
                commServerUrl,
                cryptoApi
            ),
            disabled: false
        });
    }

    // ######## Catch all routes ########

    addIncomingWebsocketRouteCatchAll_Direct(
        cryptoApi: CryptoApi,
        host: string,
        port: number
    ): void {
        MessageBus.send(
            'log',
            `addIncomingWebsocketRouteCatchAll_Direct(${uint8arrayToHexString(
                cryptoApi.publicEncryptionKey
            )}, ${host}, ${port})`
        );

        const catchAllRoute = getOrCreate(
            this.catchAllRoutes,
            castToLocalPublicKey(cryptoApi.publicEncryptionKey),
            {
                localPublicKey: castToLocalPublicKey(cryptoApi.publicEncryptionKey),
                knownRoutes: []
            }
        );

        catchAllRoute.knownRoutes.push({
            route: new IncomingWebsocketRouteDirect(
                this.incomingConnectionManager,
                host,
                port,
                cryptoApi
            ),
            disabled: true
        });
    }

    addIncomingWebsocketRouteCatchAll_CommServer(
        cryptoApi: CryptoApi,
        commServerUrl: string
    ): void {
        MessageBus.send(
            'log',
            `addIncomingWebsocketRouteCatchAll_CommServer(${uint8arrayToHexString(
                cryptoApi.publicEncryptionKey
            )}, ${commServerUrl})`
        );

        const catchAllRoute = getOrCreate(
            this.catchAllRoutes,
            castToLocalPublicKey(cryptoApi.publicEncryptionKey),
            {
                localPublicKey: castToLocalPublicKey(cryptoApi.publicEncryptionKey),
                knownRoutes: []
            }
        );

        catchAllRoute.knownRoutes.push({
            route: new IncomingWebsocketRouteCommServer(
                this.incomingConnectionManager,
                commServerUrl,
                cryptoApi
            ),
            disabled: false
        });
    }

    // ######## Enable / disable routes ########

    async enableAllRoutesForTargetAndSource(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey
    ): Promise<void> {
        await this.enableRoutes(localPublicKey, remotePublicKey);
    }

    async disableAllRoutesForTargetAndSource(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey
    ): Promise<void> {
        await this.disableRoutes(localPublicKey, remotePublicKey);
    }

    async enableRoutesForTargetAndSource(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionGroupName = 'default'
    ): Promise<void> {
        await this.enableRoutes(localPublicKey, remotePublicKey, connectionGroupName);
    }

    async disableRoutesForTargetAndSource(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionGroupName = 'default'
    ): Promise<void> {
        await this.disableRoutes(localPublicKey, remotePublicKey, connectionGroupName);
    }

    async enableRoutes(
        localPublicKey?: PublicKey,
        remotePublicKey?: PublicKey,
        connectionGroupName?: string
    ): Promise<void> {
        MessageBus.send(
            'log',
            `enableRoutes(${localPublicKey && uint8arrayToHexString(localPublicKey)}, ${
                remotePublicKey && uint8arrayToHexString(remotePublicKey)
            }, ${connectionGroupName})`
        );

        const connectionGroups = this.connectionGroupMap.entries(
            localPublicKey,
            remotePublicKey,
            connectionGroupName
        );

        // handle incoming & outgoing routes for known participants
        for (const connectionGroup of connectionGroups) {
            ConnectionRouteManager.setRoutesDisableFlags(connectionGroup, false);
            await ConnectionRouteManager.startOutgoingRoutes(connectionGroup);
            await ConnectionRouteManager.startIncomingRoutes(connectionGroup);
        }

        // handle catch all routes
        if (remotePublicKey === undefined && connectionGroupName === undefined) {
            let catchAllRoutes: CatchAllRoutes[];
            if (localPublicKey === undefined) {
                catchAllRoutes = [...this.catchAllRoutes.values()];
            } else {
                const catchAllRoute = this.catchAllRoutes.get(castToLocalPublicKey(localPublicKey));

                if (catchAllRoute === undefined) {
                    throw new Error('No catch all routes for the specified localPublicKey found.');
                }

                catchAllRoutes = [catchAllRoute];
            }

            for (const catchAllRoute of catchAllRoutes) {
                ConnectionRouteManager.setCatchAllRoutesDisableFlags(catchAllRoute, false);
                await ConnectionRouteManager.startCatchAllRoutes(catchAllRoute);
            }
        }
    }

    async disableRoutes(
        localPublicKey?: PublicKey,
        remotePublicKey?: PublicKey,
        connectionGroupName?: string
    ): Promise<void> {
        MessageBus.send(
            'log',
            `disableRoutes(${localPublicKey && uint8arrayToHexString(localPublicKey)}, ${
                remotePublicKey && uint8arrayToHexString(remotePublicKey)
            }, ${connectionGroupName})`
        );

        const connectionGroups = this.connectionGroupMap.entries(
            localPublicKey,
            remotePublicKey,
            connectionGroupName
        );

        // handle incoming & outgoing routes for known participants
        for (const connectionGroup of connectionGroups) {
            ConnectionRouteManager.setRoutesDisableFlags(connectionGroup, true);
            await ConnectionRouteManager.stopOutgoingRoutes(connectionGroup);
            await ConnectionRouteManager.stopIncomingRoutes(connectionGroup);
        }

        // handle catch all routes
        if (remotePublicKey === undefined && connectionGroupName === undefined) {
            let catchAllRoutes: CatchAllRoutes[];
            if (localPublicKey === undefined) {
                catchAllRoutes = [...this.catchAllRoutes.values()];
            } else {
                const catchAllRoute = this.catchAllRoutes.get(castToLocalPublicKey(localPublicKey));

                if (catchAllRoute === undefined) {
                    throw new Error('No catch all routes for the specified localPublicKey found.');
                }

                catchAllRoutes = [catchAllRoute];
            }

            for (const catchAllRoute of catchAllRoutes) {
                ConnectionRouteManager.setCatchAllRoutesDisableFlags(catchAllRoute, true);
                await this.stopCatchAllRoutes(catchAllRoute);
            }
        }
    }

    // ######## ConnectionHandling ########

    closeConnections(
        localPublicKey?: PublicKey,
        remotePublicKey?: PublicKey,
        connectionGroupName?: string,
        catchAll?: boolean
    ): void {
        MessageBus.send(
            'log',
            `closeConnections(${localPublicKey && uint8arrayToHexString(localPublicKey)}, ${
                remotePublicKey && uint8arrayToHexString(remotePublicKey)
            }, ${connectionGroupName})`
        );

        const connectionGroups = this.connectionGroupMap.entries(
            localPublicKey,
            remotePublicKey,
            connectionGroupName,
            catchAll
        );

        for (const connectionGroup of connectionGroups) {
            if (connectionGroup.activeConnection) {
                connectionGroup.activeConnection.close('closeConnections called by user.');
            }
        }
    }

    debugDump(header: string = ''): void {
        this.connectionGroupMap.debugDump(header);
    }

    // ######## Set disable flag ########

    private static setRoutesDisableFlags(
        connectionGroup: ConnectionGroup,
        disabled: boolean
    ): void {
        for (const route of connectionGroup.knownRoutes) {
            route.disabled = disabled;
        }
    }

    private static setCatchAllRoutesDisableFlags(
        catchAllRoutes: CatchAllRoutes,
        disabled: boolean
    ): void {
        for (const route of catchAllRoutes.knownRoutes) {
            route.disabled = disabled;
        }
    }

    // ######## Start / Stop routes ########

    private static async startOutgoingRoutes(connectionGroup: ConnectionGroup): Promise<void> {
        MessageBus.send(
            'log',
            `startOutgoingRoutes(${uint8arrayToHexString(
                connectionGroup.localPublicKey
            )}, ${uint8arrayToHexString(connectionGroup.remotePublicKey)}, ${
                connectionGroup.connectionGroupName
            })`
        );
        const errors = [];

        for (const route of connectionGroup.knownRoutes) {
            if (
                route.route.outgoing &&
                !route.disabled &&
                !route.route.active &&
                connectionGroup.activeConnection === null
            ) {
                try {
                    await route.route.start();
                } catch (e) {
                    errors.push(e);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors starting routes: ${errors}`);
        }
    }

    private static async startOutgoingRoutesDelayed(
        connectionGroup: ConnectionGroup,
        delay: number
    ): Promise<void> {
        MessageBus.send(
            'log',
            `startOutgoingRoutesDelayed(${uint8arrayToHexString(
                connectionGroup.localPublicKey
            )}, ${uint8arrayToHexString(connectionGroup.remotePublicKey)}, ${
                connectionGroup.connectionGroupName
            }, ${delay})`
        );
        if (connectionGroup.reconnectTimeoutHandle !== null) {
            return;
        }

        // Add a jitter on top of the timeout, so that both sides don't attempt connections
        // at the same time. If done properly this should not be necessary, but ... this was
        // the easy / fast fix to solve lots of duplicate connection errors.
        delay = delay * (1 + Math.random());
        MessageBus.send('debug', `startOutgoingRoutesDelayed: delay=${delay})`);

        connectionGroup.reconnectTimeoutHandle = setTimeout(() => {
            connectionGroup.reconnectTimeoutHandle = null;
            ConnectionRouteManager.startOutgoingRoutes(connectionGroup).catch(console.error);
        }, delay);
    }

    private static async stopOutgoingRoutes(connectionGroup: ConnectionGroup): Promise<void> {
        MessageBus.send(
            'log',
            `stopOutgoingRoutes(${uint8arrayToHexString(
                connectionGroup.localPublicKey
            )}, ${uint8arrayToHexString(connectionGroup.remotePublicKey)}, ${
                connectionGroup.connectionGroupName
            })`
        );

        const errors = [];
        for (const route of connectionGroup.knownRoutes) {
            if (route.route.outgoing) {
                // Stop the route if it is active
                let stopPromise = Promise.resolve();
                if (route.route.active) {
                    stopPromise = route.route.stop();
                }

                // Close the connections spawned by this route (some routes don't stop when
                // connections are still open)
                if (connectionGroup.activeConnectionRoute === route.route) {
                    const conn = ConnectionRouteManager.removeActiveConnection(connectionGroup);
                    if (conn) {
                        conn.close('Corresponding route was stopped');
                    }
                }

                // Wait for the route to be stopped
                try {
                    await stopPromise;
                } catch (e) {
                    console.error(e);
                    errors.push(e);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors stopping routes: ${errors}`);
        }
    }

    private static async startIncomingRoutes(connectionGroup: ConnectionGroup): Promise<void> {
        MessageBus.send(
            'log',
            `startIncomingRoutes(${uint8arrayToHexString(
                connectionGroup.localPublicKey
            )}, ${uint8arrayToHexString(connectionGroup.remotePublicKey)}, ${
                connectionGroup.connectionGroupName
            })`
        );
        const errors = [];

        for (const route of connectionGroup.knownRoutes) {
            if (!route.route.outgoing && !route.disabled && !route.route.active) {
                try {
                    await route.route.start();
                } catch (e) {
                    errors.push(e);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors starting routes: ${errors}`);
        }
    }

    private static async stopIncomingRoutes(connectionGroup: ConnectionGroup): Promise<void> {
        MessageBus.send(
            'log',
            `stopIncomingRoutes(${
                connectionGroup.localPublicKey &&
                uint8arrayToHexString(connectionGroup.localPublicKey)
            }, ${
                connectionGroup.remotePublicKey &&
                uint8arrayToHexString(connectionGroup.remotePublicKey)
            }, ${connectionGroup.connectionGroupName})`
        );

        const errors = [];
        for (const route of connectionGroup.knownRoutes) {
            if (!route.route.outgoing) {
                // Stop the route if it is active
                let stopPromise = Promise.resolve();
                if (route.route.active) {
                    stopPromise = route.route.stop();
                }

                // Close the connections spawned by this route (some routes don't stop when
                // connections are still open)
                if (connectionGroup.activeConnectionRoute === route.route) {
                    const conn = ConnectionRouteManager.removeActiveConnection(connectionGroup);
                    if (conn) {
                        conn.close('Corresponding route was stopped');
                    }
                }

                // Wait for the route to be stopped
                try {
                    await stopPromise;
                } catch (e) {
                    console.error(e);
                    errors.push(e);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors stopping routes: ${errors}`);
        }
    }

    private static async startCatchAllRoutes(catchAllRoutes: CatchAllRoutes): Promise<void> {
        MessageBus.send('log', `startCatchAllRoutes(${catchAllRoutes.localPublicKey})`);
        const errors = [];

        for (const route of catchAllRoutes.knownRoutes) {
            if (route.route.outgoing) {
                throw new Error('Internal error: catch all routes cannot be outgoing!');
            }

            if (!route.disabled && !route.route.active) {
                try {
                    await route.route.start();
                } catch (e) {
                    errors.push(e);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors starting routes: ${errors}`);
        }
    }

    private async stopCatchAllRoutes(catchAllRoutes: CatchAllRoutes): Promise<void> {
        MessageBus.send('log', `stopIncomingRoutes(${catchAllRoutes.localPublicKey})`);
        const errors = [];

        for (const route of catchAllRoutes.knownRoutes) {
            if (route.route.outgoing) {
                throw new Error('Internal error: catch all routes cannot be outgoing!');
            }

            // Stop the route if it is active
            let stopPromise = Promise.resolve();
            if (route.route.active) {
                stopPromise = route.route.stop();
            }

            // Close the connections spawned by this route (some routes don't stop when
            // connections are still open)
            this.closeConnections(
                ensurePublicKey(hexToUint8Array(catchAllRoutes.localPublicKey)),
                undefined,
                undefined,
                true
            );

            // Wait for the route to be stopped
            try {
                await stopPromise;
            } catch (e) {
                console.error(e);
                errors.push(e);
            }
        }

        if (errors.length > 0) {
            throw new Error(`Errors stopping routes: ${errors}`);
        }
    }

    // ######## Other stuff ########

    /**
     * This is registered as callback at the routes that spawn connections.
     *
     * @param conn - The connection object linked to the remote device.
     * @param localPublicKey - the local public key used to spawn the connection.
     * @param remotePublicKey - The remote public key. It was proven, that the other side has
     * the corresponding private key.
     * @param routeId - The identifier for the route that spawned the connection.
     * @param connectionGroupName - If connection was initiated locally this is set to the group
     * that was specified when establishing the connection. If an incoming connection was
     * accepted this will be undefined.
     * @private
     */
    private async acceptConnection(
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        routeId: string,
        connectionGroupName?: string
    ) {
        try {
            conn.log(
                MessageBus,
                `acceptConnection(${uint8arrayToHexString(localPublicKey)}, ${uint8arrayToHexString(
                    remotePublicKey
                )}, ${connectionGroupName}, ${routeId})`
            );

            const initiatedLocally = connectionGroupName !== undefined;

            // Exchange connection group name (initiator selects the group)
            connectionGroupName = await exchangeConnectionGroupName(conn, connectionGroupName);

            // Step 1: Check if we know this peer
            let connectionGroup = this.connectionGroupMap.entry(
                localPublicKey,
                remotePublicKey,
                connectionGroupName
            );

            // Step 2: If no known peer was found, then check if a catch all rule fits
            if (connectionGroup === undefined) {
                const catchAllRoute = this.catchAllRoutes.get(castToLocalPublicKey(localPublicKey));

                if (!catchAllRoute) {
                    conn.close('I do not want to communicate with you. Go Away!');
                    return;
                }

                // If we found a catch all route, then we create a new connection group for that
                // peer which we mark as catchAll connection group
                connectionGroup = this.connectionGroupMap.entryCreateIfNotExist(
                    localPublicKey,
                    remotePublicKey,
                    connectionGroupName,
                    true
                );
            }

            // Have a sync step (misusing the success message at the moment), so that the
            // connection initiator does not emit the event if the other side does not want to
            // connect.
            await sync(conn, initiatedLocally);

            // Assign a new connection
            if (connectionGroup.activeConnection === null) {
                this.assignNewConnection(connectionGroup, conn, routeId);
            } else if (connectionGroup.dropDuplicates) {
                conn.close('Duplicate connection - dropped new connection');
                return;
            } else {
                this.assignNewConnection(connectionGroup, conn, routeId);
            }

            // Now we know both sides want to connect => emit
            if (connectionGroup.isCatchAllGroup) {
                this.onConnectionViaCatchAll.emit(
                    conn,
                    localPublicKey,
                    remotePublicKey,
                    connectionGroupName,
                    routeId,
                    initiatedLocally
                );
            } else {
                this.onConnection.emit(
                    conn,
                    localPublicKey,
                    remotePublicKey,
                    connectionGroupName,
                    routeId,
                    initiatedLocally
                );
            }
        } catch (e) {
            conn.close(`${e}`);
        }
    }

    private assignNewConnection(
        connectionGroup: ConnectionGroup,
        conn: Connection,
        routeId: string
    ): void {
        // We disconnect the close handler, so that it does not run, when we close it and
        // replace it (this would trigger outgoing connections to be established)
        if (connectionGroup.disconnectCloseHandler) {
            connectionGroup.disconnectCloseHandler();
        }

        // Clear the timout that resets the drop duplicates flag.
        if (connectionGroup.dropDuplicatesTimeoutHandle !== null) {
            clearTimeout(connectionGroup.dropDuplicatesTimeoutHandle);
        }

        // Now it is safe to close the connection
        if (connectionGroup.activeConnection) {
            connectionGroup.activeConnection.close();
        }

        // Replace the old (now closed) one with the new connection
        connectionGroup.activeConnection = conn;

        // Now install another close handler.
        const disconnectCloseHandler = conn.state.onEnterState(state => {
            conn.log(
                MessageBus,
                `closeHandlerCalled(${connectionGroup.activeConnection}, ${connectionGroup.activeConnectionRoute?.id}, ${state})`
            );
            if (state === 'closed') {
                conn.log(MessageBus, 'closeHandlerCalled');
                ConnectionRouteManager.removeActiveConnection(connectionGroup);
                if (connectionGroup.isCatchAllGroup) {
                    this.connectionGroupMap.removeEntry(
                        connectionGroup.localPublicKey,
                        connectionGroup.remotePublicKey,
                        connectionGroup.connectionGroupName
                    );
                } else {
                    ConnectionRouteManager.startOutgoingRoutesDelayed(
                        connectionGroup,
                        this.reconnectDelayOnClose
                    ).catch(console.error);
                }
            }
        });
        connectionGroup.disconnectCloseHandler = () => {
            conn.log(
                MessageBus,
                `disconnectCloseHandlerCalled(${connectionGroup.activeConnection}, ${connectionGroup.activeConnectionRoute?.id})`
            );
            disconnectCloseHandler();
        };

        // Setup the dropDuplicates delay
        connectionGroup.dropDuplicates = true;
        connectionGroup.dropDuplicatesTimeoutHandle = setTimeout(() => {
            connectionGroup.dropDuplicates = false;
        }, 2000);

        // If the connection is already closed, then we need to call the disconnect handler,
        // because it was not called, yet.
        if (conn.state.currentState === 'closed') {
            connectionGroup.disconnectCloseHandler();
            connectionGroup.disconnectCloseHandler = null;
        }

        // Find the connection route that was used to establish the connection
        const route = connectionGroup.knownRoutes.find(elem => elem.route.id === routeId);
        connectionGroup.activeConnectionRoute = (route && route.route) || null;
    }

    private static removeActiveConnection(connectionGroup: ConnectionGroup): Connection | null {
        MessageBus.send(
            'log',
            `removeActiveConnection(${
                connectionGroup.localPublicKey &&
                uint8arrayToHexString(connectionGroup.localPublicKey)
            }, ${
                connectionGroup.remotePublicKey &&
                uint8arrayToHexString(connectionGroup.remotePublicKey)
            }, ${connectionGroup.connectionGroupName})`
        );
        if (connectionGroup.disconnectCloseHandler) {
            connectionGroup.disconnectCloseHandler();
        }
        connectionGroup.disconnectCloseHandler = null;
        if (connectionGroup.reconnectTimeoutHandle !== null) {
            clearTimeout(connectionGroup.reconnectTimeoutHandle);
        }
        if (connectionGroup.dropDuplicatesTimeoutHandle !== null) {
            clearTimeout(connectionGroup.dropDuplicatesTimeoutHandle);
        }
        const activeConnection = connectionGroup.activeConnection;
        connectionGroup.activeConnection = null;
        connectionGroup.activeConnectionRoute = null;

        return activeConnection;
    }
}
