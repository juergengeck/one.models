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
    getObjectByIdHash,
    onVersionedObj
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';
import InstancesModel, {LocalInstanceInfo} from './InstancesModel';

const supplyMapName = 'SupplyMap';
const demandMapName = 'DemandMap';
const matchMapName = 'MatchMap';
const catalogName = 'Catalog';

/**
 * This represents a MatchingEvents
 * @enum CatalogUpdate -> updates the catalog tags everytime a new supply or a demand is added
 *       SupplyUpdate -> updates the supplies
 *       DemandUpdate -> updates the demands
 *       NewMatch -> updates the matches
 */
export enum MatchingEvents {
    CatalogUpdate = 'catalogUpdate',
    SupplyUpdate = 'supplyUpdate',
    DemandUpdate = 'demandUpdate',
    MatchUpdate = 'matchUpdate'
}

/**
 *
 * @description Matching Model class
 * @augments EventEmitter
 */
export default class MatchingModel extends EventEmitter {
    private instancesModel: InstancesModel;

    private supplyMap: Map<string, Supply> = new Map<string, Supply>();
    private demandMap: Map<string, Demand> = new Map<string, Demand>();
    private catalogTags: Array<string> = new Array<string>();

    private anonInstanceInfo: LocalInstanceInfo | null;
    private anonInstancePersonEmail: string | null;

    constructor(instancesModel: InstancesModel) {
        super();
        this.instancesModel = instancesModel;
        this.anonInstanceInfo = null;
        this.anonInstancePersonEmail = null;
    }

    async init() {
        this.registerHooks();
        await this.initMaps();
        await this.updateInstanceInfo();

        if (this.anonInstanceInfo && this.anonInstanceInfo.personId) {
            const person = (await getObjectByIdHash(
                this.anonInstanceInfo.personId
            )) as VersionedObjectResult<Person>;

            this.anonInstancePersonEmail = person.obj.email;
        }
    }

    /*
     * initialize the supply and demandMap and the catalog tags
     */
    private async initMaps(): Promise<void> {
        try {
            const supplyMapObj = (await getObjectByIdObj({
                $type$: 'SupplyMap',
                name: supplyMapName
            })) as VersionedObjectResult<SupplyMap>;

            if (supplyMapObj.obj.map) {
                this.supplyMap = supplyMapObj.obj.map;
            }
            const demandMapObj = (await getObjectByIdObj({
                $type$: 'DemandMap',
                name: demandMapName
            })) as VersionedObjectResult<DemandMap>;

            if (demandMapObj.obj.map) {
                this.demandMap = demandMapObj.obj.map;
            }
            const catalog = (await getObjectByIdObj({
                $type$: 'Catalog',
                name: catalogName
            })) as VersionedObjectResult<Catalog>;

            if (catalog.obj.array) {
                this.catalogTags = catalog.obj.array;
            }
        } catch (err) {
            if (err.name !== 'FileNotFoundError') {
                console.error(err);
            }
        }
    }

    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (caughtObject.obj.$type$ === 'MatchResponse' && caughtObject.status === 'new') {
                await this.addMatchResponse(caughtObject.obj);
            }
        });
        onVersionedObj.addListener(async (caughtObject: VersionedObjectResult) => {
            if (caughtObject.obj.$type$ === 'Catalog' && caughtObject.status === 'new') {
                await this.registerCatalog(caughtObject.obj);
            }
        });
    }

    private async registerCatalog(catalog: Catalog): Promise<void> {
        this.catalogTags = catalog.array ? catalog.array : [];
        if (!this.catalogTags.length) {
            return;
        }
        await createSingleObjectThroughPurePlan(
            {
                module: '@module/catalog',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Catalog',
                name: 'Catalog',
                array: this.catalogTags
            }
        );
        this.emit(MatchingEvents.CatalogUpdate);
    }

    private async updateInstanceInfo(): Promise<void> {
        const infos = await this.instancesModel.localInstancesInfo();

        if (infos.length !== 2) {
            throw new Error('This application needs exactly one alternate identity!');
        }

        await Promise.all(
            infos.map(async instanceInfo => {
                if (!instanceInfo.isMain) {
                    this.anonInstanceInfo = instanceInfo;
                }
            })
        );
    }

    async sendSupplyObject(supplyInput: string): Promise<void> {
        const supply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: this.anonInstancePersonEmail,
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

        this.emit(MatchingEvents.SupplyUpdate);
    }
    async sendDemandObject(demandInput: string): Promise<void> {
        const demand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: this.anonInstancePersonEmail,
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

        this.emit(MatchingEvents.DemandUpdate);
    }

    async requestCatalogTags(): Promise<void> {
        const requestCatalog = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/requestCatalog'
            },

            {
                $type$: 'RequestCatalog',
                identity: this.anonInstancePersonEmail,
                timestamp: Date.now()
            }
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

    getCatalogTags(): Array<string> {
        return this.catalogTags;
    }

    supplies(): Map<string, Supply> {
        return this.supplyMap;
    }

    demands(): Map<string, Demand> {
        return this.demandMap;
    }

    async getMatchMap(): Promise<MatchResponse[]> {
        let matchMap: MatchResponse[] = [];

        const matchMapObj = (await getObjectByIdObj({
            $type$: 'MatchMap',
            name: matchMapName
        })) as VersionedObjectResult<MatchMap>;

        if (matchMapObj.obj.array) {
            matchMap = matchMapObj.obj.array;
        }

        return matchMap;
    }

    async addMatchResponse(matchResponse: MatchResponse): Promise<void> {
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
                name: matchMapName
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
        this.emit(MatchingEvents.MatchUpdate);
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
        this.emit(MatchingEvents.SupplyUpdate);
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
        this.emit(MatchingEvents.DemandUpdate);
    }

    /*
     * this function changes the status of a supply from active to inactive or the other way depending
     * on the actual status of the tag and the user clicking on it
     */
    async changeSupplyStatus(supplyMatch: string): Promise<void> {
        const supply = this.supplyMap.get(supplyMatch);

        const newSupply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: this.anonInstancePersonEmail,
                match: supplyMatch,
                isActive: supply ? !supply.isActive : false,
                timestamp: Date.now()
            }
        )) as UnversionedObjectResult<Supply>;

        this.supplyMap.set(supplyMatch, newSupply.obj);

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

        this.emit(MatchingEvents.SupplyUpdate);
    }

    /*
     * this function changes the status of a demand from active to inactive or the other way depending
     * on the actual status of the tag and the user clicking on it
     */
    async changeDemandStatus(value: string): Promise<void> {
        const demand = this.demandMap.get(value);

        const newDemand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: this.anonInstancePersonEmail,
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
        this.emit(MatchingEvents.DemandUpdate);
    }
}
