import EventEmitter from "events";
import {createRandomString} from "one.core/lib/system/crypto-helpers";
import {Chum, Person,VersionedObjectResult} from "@OneCoreTypes";
import {createSingleObjectThroughPurePlan} from "one.core/lib/plan";
import {VERSION_UPDATES, WriteStorageApi} from "one.core/lib/storage";
import { ChumSyncOptions } from "one.core/lib/chum-sync";
import {createChumConnectionHandler} from 'one.utils/lib/ChumConnectionHandler';
import {createChumApi} from "one.utils/lib/ChumApi";
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {createFileWriteStream} from "one.core/lib/system/storage-streams";

/**
 * Model that connects to the one.match server
 */
export default class MatchingModel extends EventEmitter {

    private Chums = new Map();
    private minimalWriteStorageApiObj = {
        createFileWriteStream: createFileWriteStream
    } as WriteStorageApi;



    private match = {
        name: 'ONE.Match',
        url: 'http://localhost:2929/'
    };

    private websocketPromisifierAPI = createWebsocketPromisifier(this.minimalWriteStorageApiObj);

    private defaultChumConfig: ChumSyncOptions = {
        connection: this.websocketPromisifierAPI,
        chumName: 'match.chum',
        localInstanceName: 'local',
        remoteInstanceName: 'remote',
        keepRunning: true,
        maxNotificationDelay: 20,
        idObjectsLatestOnly: false
    };

     promisifiedChumCreateAndStartFunction(
        chumSyncOptions: ChumSyncOptions
    ): Promise<VersionedObjectResult<Chum>> {
        const chum = createChumApi(chumSyncOptions);
        this.Chums.set(chumSyncOptions.remoteInstanceName, chum);
        chum.start();
        return chum.getResults();
    }
    async createChumConnectionHandler() {
        createChumConnectionHandler(
            this.promisifiedChumCreateAndStartFunction,1000
        );
    }

    async  setUpMatchServerConnection(): Promise<ChumSyncOptions | Chum> {
        try {
            const identity = await createRandomString(15);
            const res = await fetch(this.match.url + identity);
            const json = await res.json();

            const [client, server] = await Promise.all(
                ['client', 'server'].map(async key => {
                    const config = json[key];
                   return  (await createSingleObjectThroughPurePlan(
                        {
                            module: '@module/person',
                            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                        },
                        {
                            type: 'Person',
                            email: config
                        }
                    )) as VersionedObjectResult<Person>;
                })
            );


            const chumConfig = {
                ...this.defaultChumConfig,
                chumName: [client.obj.email, server.obj.email].sort().toString(),
                commServerGroupName: [client.obj.email, server.obj.email].sort().toString(),
                remoteInstanceName: server.obj.email,
                localInstanceName: client.obj.email,
                personForAuthAtRemote: server.idHash,
                secretForAuthAtRemote: server.hash
            };

            const chumConfigRes = (await createSingleObjectThroughPurePlan(
                {
                    module: '@module/chumSyncOptions',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                chumConfig
            )) as VersionedObjectResult<Chum>;

            createChumConnectionHandler(
                this.promisifiedChumCreateAndStartFunction,
                1000
            ).connect(chumConfig);

            return chumConfigRes.obj;

            // This can fail if the match server is unreachable
            // in which case we just retry when the app starts again.
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`Error setting up match server: ${err}`);
            return this.defaultChumConfig;
        }
    }
}
