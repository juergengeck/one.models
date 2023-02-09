import type ConnectionRoute from './ConnectionRoute';
import IncomingConnectionManager from '../IncomingConnectionManager';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import IncomingWebsocketRouteCommServer from './IncomingWebsocketRouteCommServer';

const MessageBus = createMessageBus('IncomingWebsocketRouteDirect');

export default class IncomingWebsocketRouteDirect implements ConnectionRoute {
    public readonly type = 'IncomingWebsocketRouteDirect';
    public readonly id;
    public readonly outgoing = false;

    private readonly incomingConnectionManager: IncomingConnectionManager;
    private readonly host: string;
    private readonly port: number;
    private readonly localPublicKey: Uint8Array;
    private readonly encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array;
    private readonly decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array;
    private readonly onConnectionUserArg?: unknown;

    private stopFn: (() => Promise<void>) | null = null;

    get active() {
        return this.stopFn !== null;
    }

    constructor(
        incomingConnectionManager: IncomingConnectionManager,
        host: string,
        port: number,
        localPublicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array, // Where do we
        // decide whether to accept a connection???
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ) {
        this.incomingConnectionManager = incomingConnectionManager;
        this.host = host;
        this.port = port;
        this.id = IncomingConnectionManager.directConnectionListenerId(host, port, this.type);
        this.localPublicKey = localPublicKey;
        this.encrypt = encrypt;
        this.decrypt = decrypt;
    }

    async start(): Promise<void> {
        MessageBus.send('log', 'start');
        this.stopFn = await this.incomingConnectionManager.listenForDirectConnections(
            this.host,
            this.port,
            this.localPublicKey,
            this.encrypt,
            this.decrypt,
            this.type
        );
    }

    async stop(): Promise<void> {
        MessageBus.send('log', 'stop');
        if (this.stopFn) {
            await this.stopFn();
        }
    }
}
