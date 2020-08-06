import EventEmitter from "events";
import {createRandomString} from "one.core/lib/system/crypto-helpers";
import {
    Chum,
    Person,
    UnversionedObjectResult,
    VersionedObjectResult,
    Supply,
    Demand, DemandMap, SupplyMap
} from "@OneCoreTypes";
import {createSingleObjectThroughImpurePlan, createSingleObjectThroughPurePlan} from "one.core/lib/plan";
import {
    getObjectByIdObj,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES,
    WriteStorageApi
} from "one.core/lib/storage";
import { ChumSyncOptions } from "one.core/lib/chum-sync";
import {createWebsocketPromisifier} from 'one.core/lib/websocket-promisifier';
import {createFileWriteStream} from "one.core/lib/system/storage-streams";

/**
 * Model that connects to the one.match server
 */
export default class MatchingModel extends EventEmitter {

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

    async init() {
        this.registerHooks();
    }

    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (caughtObject.obj.$type$ ==='MatchResponse') {
                console.log(caughtObject);
            }
        });
    }

    async  setUpMatchServerConnection(): Promise<Chum | undefined> {
        try {
            //TODO USE ANONYMOUS FROM SETTER FUTURE
            const identity = await createRandomString(15);
            const res = await fetch(this.match.url + identity);
            const json = await res.json();

            const [client, server] = await Promise.all(
                ['client', 'server'].map(async key => {
                    const config = json[key];
                   return  ( await createSingleObjectThroughPurePlan(
                       {
                           module: '@one/identity',
                           versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                       },
                       {
                           $type$: 'Person',
                            email: config
                        }
                    )) as VersionedObjectResult<Person>;
                })
            );
            this.websocketPromisifierAPI.connect('ws://localhost:8000/',client.obj.email);
            this.websocketPromisifierAPI.localPersonIdHash = client.idHash;
            this.websocketPromisifierAPI.remotePersonIdHash = server.idHash;

            const chumConfigRes =  createSingleObjectThroughImpurePlan(
                {module: '@one/chum-sync'},
                {
                    ...this.defaultChumConfig,
                    chumName: [client.obj.email, server.obj.email].sort().toString(),
                    commServerGroupName: [client.obj.email, server.obj.email].sort().toString(),
                    remoteInstanceName: server.obj.email,
                    localInstanceName: client.obj.email,
                    personForAuthAtRemote: server.idHash,
                    secretForAuthAtRemote: server.hash
                }
            );

            return  chumConfigRes.obj;

            // This can fail if the match server is unreachable
            // in which case we just retry when the app starts again.
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`Error setting up match server: ${err}`);
        }
        return ;
    }

    async sendSupplyObject(match: string): Promise<void> {
        //todo use chumSync not default chum
        const supply = (await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: this.defaultChumConfig.connection.localPersonIdHash,
                match: match
            }
        )) as UnversionedObjectResult<Supply>;

        const matchServer = this.defaultChumConfig.connection.remotePersonIdHash;

        const matchClient = this.defaultChumConfig.connection.localPersonIdHash;

        // eslint-disable-next-line no-console
        console.log('sending supply object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: supply.hash,
                    person: [matchServer, matchClient],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
    async sendDemandObject(match: string): Promise<void> {
        const demand = (await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: this.defaultChumConfig.connection.localPersonIdHash,
                match: match
            }
        )) as UnversionedObjectResult<Demand>;

        const matchServer = this.defaultChumConfig.connection.remotePersonIdHash;

        const matchClient = this.defaultChumConfig.connection.localPersonIdHash;

        // eslint-disable-next-line no-console
        console.log('sending demand object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: demand.hash,
                    person: [matchServer, matchClient],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
    async getSupplyMap(): Promise<VersionedObjectResult<SupplyMap>> {
        return await getObjectByIdObj({
            $type$: 'SupplyMap',
            name: 'SupplyMap'
        }) as VersionedObjectResult<SupplyMap>;
    }
    async getDemandMap():Promise<VersionedObjectResult<DemandMap>> {
        return await getObjectByIdObj({
            $type$: 'DemandMap',
            name: 'DemandMap'
        }) as VersionedObjectResult<DemandMap>;
    }
}
