import type {CryptoApi} from '../../../../../one.core/lib/crypto/CryptoApi';
import {castToLocalPublicKey} from '../ConnectionGroupMap';
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
    private readonly cryptoApi: CryptoApi;
    private readonly onConnectionUserArg?: unknown;

    private stopFn: (() => Promise<void>) | null = null;

    get active() {
        return this.stopFn !== null;
    }

    constructor(
        incomingConnectionManager: IncomingConnectionManager,
        commServerUrl: string,
        cryptoApi: CryptoApi
    ) {
        this.incomingConnectionManager = incomingConnectionManager;
        this.commServerUrl = commServerUrl;
        this.cryptoApi = cryptoApi;
        this.id = IncomingConnectionManager.communicationServerListenerId(
            commServerUrl,
            castToLocalPublicKey(cryptoApi.publicEncryptionKey),
            this.type
        );
    }

    async start(): Promise<void> {
        MessageBus.send('log', 'start');
        this.stopFn = await this.incomingConnectionManager.listenForCommunicationServerConnections(
            this.commServerUrl,
            this.cryptoApi,
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
