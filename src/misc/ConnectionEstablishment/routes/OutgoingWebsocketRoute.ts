import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import type {SymmetricCryptoApiWithKeys} from '@refinio/one.core/lib/crypto/SymmetricCryptoApi';
import type Connection from '../../Connection/Connection';
import {connectWithEncryptionUntilSuccessful} from '../protocols/EncryptedConnectionHandshake';
import type ConnectionRoute from './ConnectionRoute';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';

const MessageBus = createMessageBus('OutgoingWebsocketRoute');

export default class OutgoingWebsocketRoute implements ConnectionRoute {
    public readonly type = 'OutgoingWebsocketRoute';
    public readonly id;
    public readonly outgoing = true;

    private readonly url: string;
    private readonly cryptoApi: SymmetricCryptoApiWithKeys;
    private readonly onConnect: (
        conn: Connection,
        localPublicKey: PublicKey,
        remotePublicKey: PublicKey,
        connectionRouteId: string
    ) => void;

    private stopFn: (() => void) | null = null;

    get active() {
        return this.stopFn !== null;
    }

    constructor(
        url: string,
        cryptoApi: SymmetricCryptoApiWithKeys, // Where do we decide whether to accept a connection???
        onConnect: (
            conn: Connection,
            localPublicKey: PublicKey,
            remotePublicKey: PublicKey,
            connectionRouteId: string
        ) => void
    ) {
        this.url = url;
        this.id = `${this.type}:${url}`;
        this.cryptoApi = cryptoApi;
        this.onConnect = onConnect;
    }

    async start(): Promise<void> {
        MessageBus.send('log', 'start');
        const stoppablePromise = connectWithEncryptionUntilSuccessful(this.url, this.cryptoApi);
        this.stopFn = () => {
            stoppablePromise.stop();
            this.stopFn = null;
        };
        stoppablePromise
            .then(conn => {
                this.stopFn = null;
                this.onConnect(
                    conn.connection,
                    conn.myKey,
                    conn.remoteKey,
                    `${this.type}:${this.url}`
                );
            })
            .catch(console.trace);
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
