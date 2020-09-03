import EventEmitter from 'events';
import {
    Demand,
    MatchResponse,
    Supply,
    UnversionedObjectResult,
    VersionedObjectResult,
    SupplyMap,
    DemandMap,
    Catalog,
    MatchMap,
    Person,
    RequestCatalog
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES,
    getObjectByIdObj,
    getObjectByIdHash
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import InstancesModel, {LocalInstanceInfo} from './InstancesModel';

const supplyMapName = 'SupplyMap';
const demandMapName = 'DemandMap';
const matchMapName = 'MatchMap';
const catalogName = 'Catalog';

/**
 * Model that implements functions for sending a supply and demand to the matching server
 */
export default class MatchingModel extends EventEmitter {
    private instanceModel: InstancesModel;

    private supplyMap: Map<string, Supply> = new Map<string, Supply>();
    private demandMap: Map<string, Demand> = new Map<string, Demand>();
    private catalogTags: Array<Demand | Supply> = new Array<Demand | Supply>();

    private anonInstanceInfo: LocalInstanceInfo | null;

    private personEmail: string | null;

    constructor(instancesModel: InstancesModel) {
        super();
        this.instanceModel = instancesModel;
        this.anonInstanceInfo = null;
        this.personEmail = null;
    }

    async init() {
        this.registerHooks();
        await this.initMaps();
        await this.updateInstanceInfo();

        if (this.anonInstanceInfo && this.anonInstanceInfo.personId) {
            const person = (await getObjectByIdHash(
                this.anonInstanceInfo.personId
            )) as VersionedObjectResult<Person>;

            this.personEmail = person.obj.email;
        }
    }

    public shutdown(): void {
        this.anonInstanceInfo = null;
    }

    private async updateInstanceInfo(): Promise<void> {
        const infos = await this.instanceModel.localInstancesInfo();

        if (infos.length !== 2) {
            throw new Error('This applications needs exactly one alternate identity!');
        }

        await Promise.all(
            infos.map(async instanceInfo => {
                if (!instanceInfo.isMain) {
                    this.anonInstanceInfo = instanceInfo;
                }
            })
        );
    }

    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            console.log('UNVERSIONED', caughtObject);
            if (caughtObject.obj.$type$ === 'MatchResponse' && caughtObject.status === 'new') {
                this.addMatch(caughtObject.obj);
            }
            if (caughtObject.obj.$type$ === 'Demand' || caughtObject.obj.$type$ === 'Supply') {
                this.catalogTags.push(caughtObject.obj);
                this.emit('catalog-updated');
            }
        });
    }

    getTags(): Array<Supply | Demand> {
        return this.catalogTags;
    }
    async sendSupplyObject(supplyInput: string): Promise<void> {
        const supply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: this.personEmail,
                match: supplyInput,
                isActive: true,
                timestamp: Date.now()
            }
        )) as UnversionedObjectResult<Supply>;

        this.supplyMap.set(supply.obj.match, supply.obj);

        await createSingleObjectThroughPurePlan(
            {
                module: '@module/supplyMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'SupplyMap',
                name: supplyMapName,
                map: this.supplyMap as Map<string, Supply>
            }
        );

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

        this.emit('supplyUpdate');
    }
    async sendDemandObject(demandInput: string): Promise<void> {
        const demand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: this.personEmail,
                match: demandInput,
                isActive: true,
                timestamp: Date.now()
            }
        )) as UnversionedObjectResult<Demand>;

        this.demandMap.set(demand.obj.match, demand.obj);

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

        this.emit('demandUpdate');
    }

    async requestCatalogTags(): Promise<void> {
        const requestCatalog = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/requestCatalog'
            },
            [
                {
                    $type$: 'RequestCatalog',
                    identity: getInstanceOwnerIdHash(),
                    timestamp: new Date()
                }
            ]
        )) as UnversionedObjectResult<RequestCatalog>;

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: requestCatalog.hash,
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
            const catalog = (await getObjectByIdObj({
                $type$: 'Catalog',
                name: catalogName.toString()
            })) as VersionedObjectResult<Catalog>;

            if (catalog.obj.array) {
                this.catalogTags = catalog.obj.array;
            }
        } catch (err) {
            if (err.name !== 'FileNotFoundError') {
                throw err;
            }
        }
    }

    async getMatchMap(): Promise<MatchResponse[]> {
        let matchMap: MatchResponse[] = [];

        const matchMapObj = (await getObjectByIdObj({
            $type$: 'MatchMap',
            name: matchMapName.toString()
        })) as VersionedObjectResult<MatchMap>;

        if (matchMapObj.obj.array) {
            matchMap = matchMapObj.obj.array;
        }

        return matchMap;
    }

    async addMatch(matchResponse: MatchResponse): Promise<void> {
        const savedMatchResponse = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/matchResponse',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'MatchResponse',
                identity: matchResponse.identity,
                match: matchResponse.match,
                identityOfDemand: matchResponse.identityOfDemand
            }
        )) as UnversionedObjectResult<MatchResponse>;

        let matchMapObj;

        try {
            matchMapObj = (await getObjectByIdObj({
                $type$: 'MatchMap',
                name: matchMapName.toString()
            })) as VersionedObjectResult<MatchMap>;

            await createSingleObjectThroughPurePlan(
                {
                    module: '@module/matchMap',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'MatchMap',
                    name: matchMapName,
                    array: [
                        matchMapObj.obj.array,
                        savedMatchResponse.obj.match + '|' + savedMatchResponse.obj.identity
                    ]
                }
            );
        } catch (err) {
            await createSingleObjectThroughPurePlan(
                {
                    module: '@module/matchMap',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'MatchMap',
                    name: matchMapName,
                    array: [savedMatchResponse.obj.match + '|' + savedMatchResponse.obj.identity]
                }
            );
        }

        this.emit('newMatch');
    }

    supplies(): Map<string, Supply> {
        return this.supplyMap;
    }

    demands(): Map<string, Demand> {
        return this.demandMap;
    }

    async deleteSupply(supplyValue: string): Promise<void> {
        this.supplyMap.delete(supplyValue);

        await createSingleObjectThroughPurePlan(
            {
                module: '@module/supplyMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'SupplyMap',
                name: supplyMapName,
                map: this.supplyMap as Map<string, Supply>
            }
        );

        this.emit('supplyUpdate');
    }

    async deleteDemand(demandValue: string): Promise<void> {
        this.demandMap.delete(demandValue);

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
    }

    async changeSupplyStatus(value: string): Promise<void> {
        const supply = this.supplyMap.get(value);

        const newSupply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: this.personEmail,
                match: value,
                isActive: supply ? !supply.isActive : false,
                timestamp: Date.now()
            }
        )) as UnversionedObjectResult<Supply>;

        this.supplyMap.set(value, newSupply.obj);

        await createSingleObjectThroughPurePlan(
            {
                module: '@module/supplyMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'SupplyMap',
                name: supplyMapName,
                map: this.supplyMap as Map<string, Supply>
            }
        );

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: newSupply.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );

        this.emit('supplyUpdate');
    }

    async changeDemandStatus(value: string): Promise<void> {
        const demand = this.demandMap.get(value);

        const newDemand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: this.personEmail,
                match: value,
                isActive: demand ? !demand.isActive : false.valueOf(),
                timestamp: Date.now()
            }
        )) as UnversionedObjectResult<Demand>;

        this.demandMap.set(value, newDemand.obj);

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

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: newDemand.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );

        this.emit('demandUpdate');
    }
}
