import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {uint8arrayToHexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import {getOrCreate, isLastEntry} from '../../utils/MapUtils';
import type {ConnectionRoutesGroup} from './ConnectionRoutesGroup';

export type LocalPublicKey = HexString & {
    _1: 'LocalPublicKey';
};

export type RemotePublicKey = HexString & {
    _1: 'RemotePublicKey';
};

export type ConnectionRoutesGroupName = string & {
    _: 'ConnectionRoutesGroupName';
};

export function castToLocalPublicKey(localPublicKey: PublicKey): LocalPublicKey {
    return uint8arrayToHexString(localPublicKey) as LocalPublicKey;
}

export function castToRemotePublicKey(remotePublicKey: PublicKey): RemotePublicKey {
    return uint8arrayToHexString(remotePublicKey) as RemotePublicKey;
}

export function castToConnectionRoutesGroupName(groupName: string): ConnectionRoutesGroupName {
    return groupName as ConnectionRoutesGroupName;
}

export default class ConnectionRoutesGroupMap {
    private readonly knownConnectionsMap: Map<
        LocalPublicKey,
        Map<RemotePublicKey, Map<ConnectionRoutesGroupName, ConnectionRoutesGroup>>
    > = new Map();

    entryCreateIfNotExist(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRoutesGroupName: string,
        isCatchAllGroup: boolean
    ): ConnectionRoutesGroup {
        const entries = this.entries(localPublicKey, remotePublicKey, connectionRoutesGroupName);
        if (entries.length > 1) {
            throw new Error('Multiple connection entries found, this is a bug.');
        }
        if (entries.length < 1) {
            const remotePublicKeyEntry = getOrCreate(
                this.knownConnectionsMap,
                castToLocalPublicKey(localPublicKey),
                new Map()
            );
            const connectionGroupEntry = getOrCreate(
                remotePublicKeyEntry,
                castToRemotePublicKey(remotePublicKey),
                new Map()
            );
            return getOrCreate(
                connectionGroupEntry,
                castToConnectionRoutesGroupName(connectionRoutesGroupName),
                {
                    remotePublicKey,
                    localPublicKey,
                    groupName: connectionRoutesGroupName,
                    isCatchAllGroup: isCatchAllGroup,
                    activeConnection: null,
                    activeConnectionRoute: null,
                    knownRoutes: [],
                    dropDuplicates: false,
                    closeHandler: null,
                    disconnectCloseHandler: null,
                    reconnectTimeoutHandle: null,
                    dropDuplicatesTimeoutHandle: null
                }
            );
        }
        return entries[0];
    }

    /**
     * Get the corresponding entry or undefined if none exists.
     *
     * @param localPublicKey
     * @param remotePublicKey
     * @param connectionRoutesGroupName
     */
    entry(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRoutesGroupName: string
    ): ConnectionRoutesGroup | undefined {
        const entries = this.entries(localPublicKey, remotePublicKey, connectionRoutesGroupName);
        if (entries.length > 1) {
            throw new Error('Multiple connection entries found, this is a bug.');
        }
        if (entries.length < 1) {
            return undefined;
        }
        return entries[0];
    }

    entries(
        localPublicKey?: PublicKey,
        remotePublicKey?: PublicKey,
        connectionRoutesGroupName?: string,
        catchAll?: boolean
    ): ConnectionRoutesGroup[] {
        let filteredByLocalPublicKey: Map<
            RemotePublicKey,
            Map<ConnectionRoutesGroupName, ConnectionRoutesGroup>
        >[];
        if (localPublicKey !== undefined) {
            const entry = this.knownConnectionsMap.get(castToLocalPublicKey(localPublicKey));
            filteredByLocalPublicKey = entry === undefined ? [] : [entry];
        } else {
            filteredByLocalPublicKey = [...this.knownConnectionsMap.values()];
        }

        let filteredByRemotePublicKey: Map<ConnectionRoutesGroupName, ConnectionRoutesGroup>[];
        if (remotePublicKey !== undefined) {
            const temp = filteredByLocalPublicKey.map(map =>
                map.get(castToRemotePublicKey(remotePublicKey))
            );
            filteredByRemotePublicKey = temp.filter(
                (e): e is Exclude<typeof e, undefined> => e !== undefined
            );
        } else {
            const temp = filteredByLocalPublicKey.map(map => [...map.values()]);
            filteredByRemotePublicKey = temp.reduce((accu, value) => accu.concat(value), []);
        }

        let filteredByConnectionGroup: ConnectionRoutesGroup[];
        if (connectionRoutesGroupName !== undefined) {
            const temp = filteredByRemotePublicKey.map(map =>
                map.get(castToConnectionRoutesGroupName(connectionRoutesGroupName))
            );
            filteredByConnectionGroup = temp.filter(
                (e): e is Exclude<typeof e, undefined> => e !== undefined
            );
        } else {
            const temp = filteredByRemotePublicKey.map(map => [...map.values()]);
            filteredByConnectionGroup = temp.reduce((accu, value) => accu.concat(value), []);
        }

        let filteredByCatchAll: ConnectionRoutesGroup[];
        if (catchAll !== undefined) {
            filteredByCatchAll = filteredByConnectionGroup.filter(
                e => e.isCatchAllGroup === catchAll
            );
        } else {
            filteredByCatchAll = filteredByConnectionGroup;
        }

        return filteredByCatchAll;
    }

    removeEntry(
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRoutesGroupName: string
    ): void {
        const localPublicKeyStr = castToLocalPublicKey(localPublicKey);
        const remotePublicKeyStr = castToRemotePublicKey(remotePublicKey);
        const connectionGroupNameStr = castToConnectionRoutesGroupName(connectionRoutesGroupName);

        const localPublicKeyEntry = this.knownConnectionsMap.get(localPublicKeyStr);
        if (localPublicKeyEntry === undefined) {
            return;
        }

        const remotePublicKeyEntry = localPublicKeyEntry.get(remotePublicKeyStr);
        if (remotePublicKeyEntry === undefined) {
            return;
        }

        const connectionGroupNameEntry = remotePublicKeyEntry.get(connectionGroupNameStr);
        if (connectionGroupNameEntry === undefined) {
            return;
        }

        // Remove the parent map entries if they have no elements left.
        remotePublicKeyEntry.delete(connectionGroupNameStr);
        if (remotePublicKeyEntry.size === 0) {
            localPublicKeyEntry.delete(remotePublicKeyStr);
            if (localPublicKeyEntry.size === 0) {
                this.knownConnectionsMap.delete(localPublicKeyStr);
            }
        }
    }

    getIpAddress(conn: ConnectionRoutesGroup) {
        if (
            conn.activeConnection &&
            conn.activeConnection.websocketPlugin().webSocket &&
            // @ts-ignore
            conn.activeConnection.websocketPlugin().webSocket._socket
        ) {
            // @ts-ignore
            return conn.activeConnection.websocketPlugin().webSocket._socket.remoteAddress;
        }
    }

    debugDump(header: string = ''): void {
        console.log(`------------ ${header}knownConnectionsMap ------------`);
        for (const localPubliKeyEntry of this.knownConnectionsMap) {
            console.log(` - ${localPubliKeyEntry[0]}`);
            const c1 = isLastEntry(this.knownConnectionsMap, localPubliKeyEntry) ? ' ' : '|';

            for (const remotePublicKeyEntry of localPubliKeyEntry[1]) {
                console.log(`   |- ${remotePublicKeyEntry[0]}`);
                const c2 = isLastEntry(localPubliKeyEntry[1], remotePublicKeyEntry) ? ' ' : '|';

                for (const channelIdEntry of remotePublicKeyEntry[1]) {
                    console.log(`   ${c1}  |- ${channelIdEntry[0]}`);
                    console.log(
                        `   ${c1}  ${c2}  |- activeConnection: ${channelIdEntry[1].activeConnection}`
                    );

                    console.log(
                        `   ${c1}  ${c2}  |- ipAddress: ${this.getIpAddress(channelIdEntry[1])}`
                    );
                    console.log(
                        `   ${c1}  ${c2}  |- activeConnectionRoute: ${channelIdEntry[1].activeConnectionRoute?.id}`
                    );
                    console.log(
                        `   ${c1}  ${c2}  |- isCatchAllGroup: ${channelIdEntry[1].isCatchAllGroup}`
                    );
                    console.log(`   ${c1}  ${c2}  |- knownRoutes`);
                    const c3 = isLastEntry(remotePublicKeyEntry[1], channelIdEntry) ? ' ' : '|';

                    for (const route of channelIdEntry[1].knownRoutes) {
                        console.log(
                            `   ${c1}  ${c2}  ${c3}  |- ${route.route.id} outgoing:${route.route.outgoing} active:${route.route.active}`
                        );
                    }
                }
            }
        }
        console.log('---------------------------------------------');
    }
}
