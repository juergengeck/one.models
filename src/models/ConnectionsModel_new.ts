import EventEmitter from 'events';
import CommunicationModule from '../../lib/misc/CommunicationModule';
import ContactModel from '../../lib/models/ContactModel';
import InstancesModel from '../../lib/models/InstancesModel';
import EncryptedConnection from '../../lib/misc/EncryptedConnection';
import {ChumSyncOptions} from 'one.core/lib/chum-sync';
import {
    createWebsocketPromisifier,
    WebsocketPromisifierAPI
} from 'one.core/lib/websocket-promisifier';
import {createSingleObjectThroughImpurePlan, WriteStorageApi} from 'one.core/lib/storage';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';

export class ConnectionsModel extends EventEmitter {
    private communicationModule: CommunicationModule;

    constructor(commServerUrl: string, contactModel: ContactModel, instancesModel: InstancesModel) {
        super();
        this.communicationModule = new CommunicationModule(
            commServerUrl,
            contactModel,
            instancesModel
        );
        this.communicationModule.onKnownConnection = this.onKnownConnection;
        this.communicationModule.onUnknownConnection = this.onUnknownConnection;
    }

    async init(): Promise<void> {}

    async onKnownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        initiatedLocally: boolean
    ): Promise<void> {
        // TODO: challenge response for person keys
        const minimalWriteStorageApiObj = {
            createFileWriteStream
        } as WriteStorageApi;

        const webSocketPromisifier = createWebsocketPromisifier(minimalWriteStorageApiObj, conn);

        await this.startChum(webSocketPromisifier);
    }

    async onUnknownConnection(
        conn: EncryptedConnection,
        localPublicKey: Uint8Array,
        remotePublicKey: Uint8Array,
        initiatedLocally: boolean
    ): Promise<void> {
        // TODO: use pairing information for connecting to server
    }

    async startChum(websocketPromisifierAPI: WebsocketPromisifierAPI): Promise<void> {
        const defaultInitialChumObj: ChumSyncOptions = {
            connection: websocketPromisifierAPI,

            // used only for logging purpose
            chumName: 'ConnectionsChum',
            localInstanceName: 'local',
            remoteInstanceName: 'remote',

            keepRunning: true,
            maxNotificationDelay: 20
        };

        await createSingleObjectThroughImpurePlan(
            {module: '@one/chum-sync'},
            defaultInitialChumObj
        );
    }
}
