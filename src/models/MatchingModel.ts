import EventEmitter from 'events';
import {
    Demand,
    MatchResponse,
    Supply,
    UnversionedObjectResult,
    VersionedObjectResult,
    NotifiedUsers,
    SHA256Hash,
    SHA256IdHash,
    Person,
    SupplyMap,
    DemandMap
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES,
    getObjectByIdObj
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';

const supplyMapName: string = 'SupplyMap';
const demandMapName: string = 'DemandMap';

/**
 * Model that implements functions for sending a supply and demand to the matching server
 */
export default class MatchingModel extends EventEmitter {
    private supplyMap: Map<string, Supply[]> = new Map<string, Supply[]>();
    private demandMap: Map<string, Demand[]> = new Map<string, Demand[]>();

    async init() {
        this.registerHooks();
        this.initMaps();
    }

    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (caughtObject.obj.$type$ === 'MatchResponse') {
                console.log(caughtObject);
            }
        });
    }

    async sendSupplyObject(supplyInput: string): Promise<void> {
        const supply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: 'local',
                match: supplyInput
            }
        )) as UnversionedObjectResult<Supply>;

        const existingClients = this.supplyMap.get(supply.obj.match);
        const allSourceClients = existingClients ? [...existingClients, supply.obj] : [supply.obj];
        this.supplyMap.set(supply.obj.match, allSourceClients);

        const map = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supplyMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'SupplyMap',
                name: supplyMapName,
                map: this.supplyMap as Map<string, Supply[]>
            }
        )) as VersionedObjectResult<SupplyMap>;

        console.log('map: ', map);

        this.emit('supplyUpdate');

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        // eslint-disable-next-line no-console
        console.log('sending supply object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: supply.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
    async sendDemandObject(demandInput: string): Promise<void> {
        const demand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: 'local',
                match: demandInput
            }
        )) as UnversionedObjectResult<Supply>;

        const existingClients = this.supplyMap.get(demand.obj.match);
        const allSourceClients = existingClients ? [...existingClients, demand.obj] : [demand.obj];
        this.supplyMap.set(demand.obj.match, allSourceClients);

        await createSingleObjectThroughPurePlan(
            {
                module: '@module/demandMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'DemandMap',
                name: demandMapName.toString(),
                map: this.demandMap
            }
        );

        this.emit('demandUpdate');

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        // eslint-disable-next-line no-console
        console.log('sending demand object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: demand.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

    // init the maps with saved values
    private async initMaps(): Promise<void> {
        try {
            const supplyMapObj = (await getObjectByIdObj({
                $type$: 'SupplyMap',
                name: supplyMapName.toString()
            })) as VersionedObjectResult<SupplyMap>;

            if (supplyMapObj.obj.map) {
                this.supplyMap = supplyMapObj.obj.map;
            }
            const demandMapObj = (await getObjectByIdObj({
                $type$: 'DemandMap',
                name: demandMapName.toString()
            })) as VersionedObjectResult<DemandMap>;

            if (demandMapObj.obj.map) {
                this.demandMap = demandMapObj.obj.map;
            }
        } catch (err) {
            if (err.name !== 'FileNotFoundError') {
                throw err;
            }
        }
    }

    supplies(): Map<string, Supply[]> {
        return this.supplyMap;
    }

    demands(): Map<string, Demand[]> {
        return this.demandMap;
    }
}
