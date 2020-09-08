import EventEmitter from 'events';
import InstancesModel, {LocalInstanceInfo} from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import {
    Person,
    SHA256IdHash,
    Supply,
    Demand,
    VersionedObjectResult,
    SupplyMap,
    DemandMap
} from '@OneCoreTypes';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectByIdObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {serializeWithType} from 'one.core/lib/util/promise';

/**
 * This class contains the common behaviour used both by clients and
 * by matching server for communicating using the communication server.
 *
 * @description Matching Model class
 * @augments EventEmitter
 */
export default abstract class MatchingModel extends EventEmitter {
    protected instancesModel: InstancesModel;
    protected channelManager: ChannelManager;
    protected anonInstanceInfo: LocalInstanceInfo | null;
    protected channelId = 'matching';

    protected suppliesMap: Map<string, Supply[]>;
    protected demandsMap: Map<string, Demand[]>;

    protected supplyMapName = 'SupplyMap';
    protected demandMapName = 'DemandMap';

    protected constructor(instancesModel: InstancesModel, channelManager: ChannelManager) {
        super();
        this.instancesModel = instancesModel;
        this.channelManager = channelManager;
        this.anonInstanceInfo = null;
        this.suppliesMap = new Map<string, Supply[]>();
        this.demandsMap = new Map<string, Demand[]>();
    }

    /**
     * Will be implemented in each child class.
     *
     * @returns {Promise<void>}
     */
    abstract async init(): Promise<void>;

    protected async startMatchingChannel(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    /**
     * For the channels the current instance information had to be known.
     * Only the anonymous information is important, because the channels
     * will be shared between clients and servers and the main identity
     * should never be leaked.
     *
     * @returns {Promise<void>}
     * @protected
     */
    protected async updateInstanceInfo(): Promise<void> {
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

    /**
     * The channel which holds the corresponding matching objects should be
     * shared between clients and server.
     *
     * @param {SHA256IdHash<Person>[]} person
     * @returns {Promise<void>}
     * @protected
     */
    protected async giveAccessToMatchingChannel(person: SHA256IdHash<Person>[]): Promise<void> {
        try {
            const setAccessParam = {
                id: await calculateIdHashOfObj({
                    $type$: 'ChannelInfo',
                    id: this.channelId,
                    owner: this.anonInstanceInfo ? this.anonInstanceInfo.personId : undefined
                }),
                person,
                group: [],
                mode: SET_ACCESS_MODE.REPLACE
            };
            // check whether a channel with this id exists
            await getObjectByIdHash(setAccessParam.id);
            // if it exists, set the access rights
            await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);

            // TODO: should we give access to matching server to the contacts channel?
            setAccessParam.id = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: 'contacts',
                owner: this.anonInstanceInfo ? this.anonInstanceInfo.personId : undefined
            });
            // check whether a channel with this id exists
            await getObjectByIdHash(setAccessParam.id);
            // if it exists, set the access rights
            await createSingleObjectThroughPurePlan({module: '@one/access'}, [setAccessParam]);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.name !== 'FileNotFoundError') {
                throw error;
            }
        }
    }

    protected async initialiseMaps(): Promise<void> {
        try {
            const supplyMapObj = (await getObjectByIdObj({
                $type$: 'SupplyMap',
                name: this.supplyMapName
            })) as VersionedObjectResult<SupplyMap>;

            if (supplyMapObj.obj.map) {
                this.suppliesMap = supplyMapObj.obj.map;
            }

            const demandMapObj = (await getObjectByIdObj({
                $type$: 'DemandMap',
                name: this.demandMapName
            })) as VersionedObjectResult<DemandMap>;

            if (demandMapObj.obj.map) {
                this.demandsMap = demandMapObj.obj.map;
            }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (err.name !== 'FileNotFoundError') {
                throw err;
            }
        }
    }

    protected addNewValueToSupplyMap(supply: Supply): void {
        let availableSupplies = this.suppliesMap.get(supply.match);
        if (availableSupplies) {
            availableSupplies.push(supply);
        } else {
            availableSupplies = [supply];
        }
        this.suppliesMap.set(supply.match, availableSupplies);
    }

    protected addNewValueToDemandMap(demand: Demand): void {
        let availableDemands = this.demandsMap.get(demand.match);
        if (availableDemands) {
            availableDemands.push(demand);
        } else {
            availableDemands = [demand];
        }
        this.demandsMap.set(demand.match, availableDemands);
    }

    /**
     * This functions memorise the latest version of the SupplyMap.
     *
     * @returns {Promise<void>}
     * @private
     */
    protected async memoriseLatestVersionOfSupplyMap(): Promise<void> {
        await serializeWithType('SupplyMap', async () => {
            await createSingleObjectThroughPurePlan(
                {
                    module: '@module/supplyMap',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'SupplyMap',
                    name: this.supplyMapName,
                    map: this.suppliesMap
                }
            );
        });
    }

    /**
     * This functions memorise the latest version of the DemandMap.
     *
     * @returns {Promise<void>}
     * @private
     */
    protected async memoriseLatestVersionOfDemandMap(): Promise<void> {
        await serializeWithType('DemandMap', async () => {
            await createSingleObjectThroughPurePlan(
                {
                    module: '@module/demandMap',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'DemandMap',
                    name: this.demandMapName,
                    map: this.demandsMap
                }
            );
        });
    }
}
