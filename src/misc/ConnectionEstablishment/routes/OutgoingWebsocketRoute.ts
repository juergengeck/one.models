import type {PublicKey} from '../../../../../one.core/lib/crypto/encryption';
import type Connection from '../../Connection/Connection';
import {connectWithEncryptionUntilSuccessful} from '../protocols/ConnectionSetup';
import type ConnectionRoute from './ConnectionRoute';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';

const MessageBus = createMessageBus('OutgoingWebsocketRoute');

export default class OutgoingWebsocketRoute implements ConnectionRoute {
    public readonly type = 'OutgoingWebsocketRoute';
    public readonly id;
    public readonly outgoing = true;

    private readonly url: string;
    private readonly reconnectDelay: number;
    private readonly localPublicKey: PublicKey;
    private readonly remotePublicKey: PublicKey;
    private readonly encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array;
    private readonly decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array;
    private readonly onConnect: (
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        routeId: string
    ) => void;

    private stopFn: (() => void) | null = null;

    get active() {
        return this.stopFn !== null;
    }

    constructor(
        url: string,
        reconnectDelay: number,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        encrypt: (pubKeyOther: PublicKey, text: Uint8Array) => Uint8Array, // Where do we decide wether to accept a connection???
        decrypt: (pubKeyOther: PublicKey, cypher: Uint8Array) => Uint8Array,
        onConnect: (
            conn: Connection,
            localPublicKey: PublicKey,
            remotePublicKey: PublicKey,
            routeId: string
        ) => void
    ) {
        this.url = url;
        this.id = `${this.type}:${url}`;
        this.reconnectDelay = reconnectDelay;
        this.localPublicKey = localPublicKey;
        this.remotePublicKey = remotePublicKey;
        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.onConnect = onConnect;
    }

    async start(): Promise<void> {
        MessageBus.send('log', 'start');
        const stoppablePromise = connectWithEncryptionUntilSuccessful(
            this.url,
            this.localPublicKey,
            this.remotePublicKey,
            text => this.encrypt(this.remotePublicKey, text),
            cypher => this.decrypt(this.remotePublicKey, cypher),
            this.reconnectDelay
        );
        this.stopFn = () => {
            stoppablePromise.stop();
            this.stopFn = null;
        };
        stoppablePromise.then(conn => {
            this.stopFn = null;
            this.onConnect(conn.connection, conn.myKey, conn.remoteKey, `${this.type}:${this.url}`);
        });
        stoppablePromise.catch(e => {
            this.stopFn = null;
        });
    }

    async stop(): Promise<void> {
        MessageBus.send('log', 'stop');
        if (this.stopFn) {
            this.stopFn();
        }
    }
}
