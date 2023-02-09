import type ConnectionRoute from './ConnectionRoute';
import IncomingConnectionManager from '../IncomingConnectionManager';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';

const MessageBus = createMessageBus('IncomingWebsocketRouteCommServer');

export default class IncomingWebsocketRouteCommServer implements ConnectionRoute {
    public readonly type = 'IncomingWebsocketRouteCommServer';
    public readonly id;
    public readonly outgoing = false;

    private readonly incomingConnectionManager: IncomingConnectionManager;
    private readonly commServerUrl: string;
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
        commServerUrl: string,
        localPublicKey: Uint8Array,
        encrypt: (pubKeyOther: Uint8Array, text: Uint8Array) => Uint8Array, // Where do we decide wether to accept a connection???
        decrypt: (pubKeyOther: Uint8Array, cypher: Uint8Array) => Uint8Array
    ) {
        this.incomingConnectionManager = incomingConnectionManager;
        this.commServerUrl = commServerUrl;
        this.id = IncomingConnectionManager.communicationServerListenerId(
            commServerUrl,
            localPublicKey,
            this.type
        );
        this.localPublicKey = localPublicKey;
        this.encrypt = encrypt;
        this.decrypt = decrypt;
    }

    async start(): Promise<void> {
        MessageBus.send('log', 'start');
        this.stopFn = await this.incomingConnectionManager.listenForCommunicationServerConnections(
            this.commServerUrl,
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
