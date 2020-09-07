import EventEmitter from 'events';
import {
    Demand,
    MatchResponse,
    Supply,
    UnversionedObjectResult,
    VersionedObjectResult,
    SupplyMap,
    DemandMap,
    MatchMap,
    Person,
    Contact,
    SHA256IdHash
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES,
    getObjectByIdObj,
    getObjectByIdHash,
    createManyObjectsThroughPurePlan
} from 'one.core/lib/storage';
import InstancesModel, {LocalInstanceInfo} from './InstancesModel';
import matchingContact from './matching_contact/matching_public_contact.json';
import ChannelManager from './ChannelManager';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

const mySupplyMapName = 'MySupplyMap';
const myDemandMapName = 'MyDemandMap';
const matchMapName = 'MatchMap';

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
    private channelManager: ChannelManager;

    private mySuppliesMap: Map<string, Supply>;
    private myDemandsMap: Map<string, Demand>;

    private allSuppliesMap: Map<string, Supply[]>;
    private allDemandsMap: Map<string, Demand[]>;

    private anonInstanceInfo: LocalInstanceInfo | null;
    private anonInstancePersonEmail: string | null;

    private matchingServerPersonIdHash: SHA256IdHash<Person> | undefined;

    private channelId = 'matching';

    constructor(instancesModel: InstancesModel, channelManager: ChannelManager) {
        super();
        this.instancesModel = instancesModel;
        this.channelManager = channelManager;
        this.anonInstanceInfo = null;
        this.anonInstancePersonEmail = null;
        this.matchingServerPersonIdHash = undefined;
        this.mySuppliesMap = new Map<string, Supply>();
        this.myDemandsMap = new Map<string, Demand>();
        this.allSuppliesMap = new Map<string, Supply[]>();
        this.allDemandsMap = new Map<string, Demand[]>();
    }

    async init() {
        // connect to the matching server
        const importedMatchingContact: UnversionedObjectResult<
            Contact
        >[] = await createManyObjectsThroughPurePlan(
            {
                module: '@module/explodeObject',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            decodeURI(matchingContact.data)
        );

        this.matchingServerPersonIdHash = importedMatchingContact[0].obj.personId;

        await this.channelManager.createChannel(this.channelId);
        await this.applyAccessRights();

        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });

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
                name: mySupplyMapName
            })) as VersionedObjectResult<SupplyMap>;

            if (supplyMapObj.obj.map) {
                this.mySuppliesMap = supplyMapObj.obj.map;
            }
            const demandMapObj = (await getObjectByIdObj({
                $type$: 'DemandMap',
                name: myDemandMapName
            })) as VersionedObjectResult<DemandMap>;

            if (demandMapObj.obj.map) {
                this.myDemandsMap = demandMapObj.obj.map;
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
            if (caughtObject.obj.$type$ === 'Supply') {
                let existingSupplies = this.allSuppliesMap.get(caughtObject.obj.match);

                if (!existingSupplies) {
                    existingSupplies = [];
                }
                existingSupplies.push(caughtObject.obj);
                this.allSuppliesMap.set(caughtObject.obj.match, existingSupplies);
            }
            if (caughtObject.obj.$type$ === 'Demand') {
                let existingDemands = this.allDemandsMap.get(caughtObject.obj.match);

                if (!existingDemands) {
                    existingDemands = [];
                }
                existingDemands.push(caughtObject.obj);
                this.allDemandsMap.set(caughtObject.obj.match, existingDemands);
            }
        });
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

        this.mySuppliesMap.set(supply.obj.match, supply.obj);
        await this.memoriseLatestVersionOfSupplyMap();
        await this.channelManager.postToChannel(this.channelId, supply.obj);
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

        this.myDemandsMap.set(demand.obj.match, demand.obj);
        await this.memoriseLatestVersionOfDemandMap();
        await this.channelManager.postToChannel(this.channelId, demand.obj);
        this.emit(MatchingEvents.DemandUpdate);
    }

    getMySupplies(): Map<string, Supply> {
        return this.mySuppliesMap;
    }

    getMyDemands(): Map<string, Demand> {
        return this.myDemandsMap;
    }

    getAllAvailableSuppliesAndDemands(): Array<string> {
        const allObjects: string[] = [];
        this.allDemandsMap.forEach(allDemands => {
            allDemands.forEach(demand => {
                allObjects.push(demand.match);
            });
        });
        this.allSuppliesMap.forEach(allSupplies => {
            allSupplies.forEach(supply => {
                allObjects.push(supply.match);
            });
        });

        return [...new Set(allObjects)];
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
        this.mySuppliesMap.delete(supplyValue);
        await this.memoriseLatestVersionOfSupplyMap();
        this.emit(MatchingEvents.SupplyUpdate);
    }

    async deleteDemand(demandValue: string): Promise<void> {
        this.myDemandsMap.delete(demandValue);
        await this.memoriseLatestVersionOfDemandMap();
        this.emit(MatchingEvents.DemandUpdate);
    }

    /*
     * this function changes the status of a supply from active to inactive or the other way depending
     * on the actual status of the tag and the user clicking on it
     */
    async changeSupplyStatus(supplyMatch: string): Promise<void> {
        const supply = this.mySuppliesMap.get(supplyMatch);

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

        this.mySuppliesMap.set(supplyMatch, newSupply.obj);
        await this.memoriseLatestVersionOfSupplyMap();
        await this.channelManager.postToChannel(this.channelId, newSupply.obj);
        this.emit(MatchingEvents.SupplyUpdate);
    }

    /*
     * this function changes the status of a demand from active to inactive or the other way depending
     * on the actual status of the tag and the user clicking on it
     */
    async changeDemandStatus(value: string): Promise<void> {
        const demand = this.myDemandsMap.get(value);

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

        this.myDemandsMap.set(value, newDemand.obj);
        await this.memoriseLatestVersionOfDemandMap();
        await this.channelManager.postToChannel(this.channelId, newDemand.obj);
        this.emit(MatchingEvents.DemandUpdate);
    }

    private async memoriseLatestVersionOfSupplyMap(): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@module/supplyMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'SupplyMap',
                name: mySupplyMapName,
                map: this.mySuppliesMap as Map<string, Supply>
            }
        );
    }

    private async memoriseLatestVersionOfDemandMap(): Promise<void> {
        await createSingleObjectThroughPurePlan(
            {
                module: '@module/demandMap',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'DemandMap',
                name: myDemandMapName.toString(),
                map: this.myDemandsMap
            }
        );
    }

    private async applyAccessRights(): Promise<void> {
        // Apply the access rights
        try {
            const setAccessParam = {
                id: await calculateIdHashOfObj({
                    $type$: 'ChannelInfo',
                    id: this.channelId,
                    owner: this.anonInstanceInfo ? this.anonInstanceInfo.personId : undefined
                }),
                person: [
                    this.matchingServerPersonIdHash,
                    this.anonInstanceInfo ? this.anonInstanceInfo.personId : ''
                ],
                group: [],
                mode: SET_ACCESS_MODE.REPLACE
            };
            await getObjectByIdHash(setAccessParam.id); // To check whether a channel with this id exists
            await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.name !== 'FileNotFoundError') {
                console.error(error);
            }
        }
    }
}
