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
} from '@OneObjectInterfaces';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectByIdObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {serializeWithType} from 'one.core/lib/util/promise';
import {Model} from '../Model';
import {OEvent} from '../../misc/OEvent';

/**
 * This class contains the common behaviour used both by clients and
 * by matching server for communicating using the communication server.
 *
 * @description Matching Model class
 * @augments EventEmitter
 */
export default abstract class MatchingModel extends EventEmitter implements Model {
    /**
     * Event emitted when matching data is updated.
     */
    public onUpdated = new OEvent<() => void>();

    protected instancesModel: InstancesModel;
    protected channelManager: ChannelManager;
    protected anonInstanceInfo: LocalInstanceInfo | null;
    protected channelId = 'matching';

    protected suppliesMap: Map<string, Supply[]>;
    protected demandsMap: Map<string, Demand[]>;

    protected supplyMapName = 'SupplyMap';
    protected demandMapName = 'DemandMap';

    private disconnect: (() => void) | undefined;

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
        this.disconnect = this.channelManager.onUpdated(this.handleUpdate.bind(this));
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
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
            if (!this.anonInstanceInfo) {
                throw new Error('Anon instance info is not initialized!');
            }

            const setAccessParam = {
                id: await calculateIdHashOfObj({
                    $type$: 'ChannelInfo',
                    id: this.channelId,
                    owner: this.anonInstanceInfo.personId
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
                owner: this.anonInstanceInfo.personId
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

    /**
     * Initialise supplies and demands maps.
     *
     * @returns {Promise<void>}
     * @protected
     */
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

    /**
     * Memorise the corresponding Supply object if it does not
     * exist in the supplies map.
     *
     * @param {Supply} supply
     * @protected
     */
    protected addNewValueToSupplyMap(supply: Supply): void {
        let availableSupplies = this.suppliesMap.get(supply.match);

        if (!availableSupplies) {
            availableSupplies = [];
        }

        if (!MatchingModel.arrayIncludesObject(availableSupplies, supply)) {
            availableSupplies.push(supply);
        }

        this.suppliesMap.set(supply.match, availableSupplies);
    }

    /**
     * Memorise the corresponding Demand object if it does not
     * exist in the supplies map.
     *
     * @param {Demand} demand
     * @protected
     */
    protected addNewValueToDemandMap(demand: Demand): void {
        let availableDemands = this.demandsMap.get(demand.match);

        if (!availableDemands) {
            availableDemands = [];
        }

        if (!MatchingModel.arrayIncludesObject(availableDemands, demand)) {
            availableDemands.push(demand);
        }

        this.demandsMap.set(demand.match, availableDemands);
    }

    /**
     * This function gets a supply and search for last version of it
     * in the supply map and replace it with the new version
     *
     * @param {Supply} newSupply
     */
    protected updateSupplyInSupplyMap(newSupply: Supply) {
        let availableSupplies = this.suppliesMap.get(newSupply.match);

        if (availableSupplies) {
            const supplyIndex = availableSupplies.findIndex(
                supplyElement => supplyElement.identity === newSupply.identity
            );

            availableSupplies.splice(supplyIndex, 1);
            availableSupplies.push(newSupply);
        }
    }

    /**
     * This function gets a demand and search for last version of it
     * in the demand map and replace it with the new version
     *
     * @param {Demand} newDemand
     */
    protected updateDemandInDemandMap(newDemand: Demand) {
        let availableDemands = this.demandsMap.get(newDemand.match);

        if (availableDemands) {
            const demandIndex = availableDemands.findIndex(
                demandElement => demandElement.identity === newDemand.identity
            );

            availableDemands.splice(demandIndex, 1);
            availableDemands.push(newDemand);
        }
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
                    module: '@one/identity',
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
                    module: '@one/identity',
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

    /**
     * Verify if the Supply or Demand object received as parameter
     * does not exist in the objects array.
     *
     * This function is the corespondent of Array.includes but
     * adapted specially for Supply and Demand objects.
     *
     * @param {Supply[] | Demand[]} objectsArray
     * @param {Supply | Demand} object
     * @returns {boolean}
     * @private
     */
    private static arrayIncludesObject(
        objectsArray: Supply[] | Demand[],
        object: Supply | Demand
    ): boolean {
        for (let i = 0; i < objectsArray.length; i++) {
            if (
                objectsArray[i].$type$ === object.$type$ &&
                objectsArray[i].identity === object.identity &&
                objectsArray[i].match === object.match &&
                objectsArray[i].isActive === object.isActive &&
                objectsArray[i].timestamp === object.timestamp
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * This function checks if the received object is here
     * as an update of active status for one of existing objects
     *
     * The logic is next: when a new object is received with same
     * values, but with a different active status, this means this new object
     * was sent to replace the old one, because the 'isActive' attribute was changed
     *
     * @param {Supply[] | Demand[]} objectsArray
     * @param {Supply | Demand} object
     * @returns {boolean}
     */
    protected static checkIfItIsAnUpdate(
        objectsMap: Map<string, (Demand | Supply)[]>,
        tagObject: Supply | Demand
    ): boolean {
        const objectsArray = objectsMap.get(tagObject.match);

        if (objectsArray) {
            for (let i = 0; i < objectsArray.length; i++) {
                if (
                    objectsArray[i].$type$ === tagObject.$type$ &&
                    objectsArray[i].identity === tagObject.identity &&
                    objectsArray[i].match === tagObject.match &&
                    objectsArray[i].isActive !== tagObject.isActive &&
                    objectsArray[i].timestamp === tagObject.timestamp
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     *  Handler function for the 'updated' event
     *  @param {string} id
     * @return {Promise<void>}
     */
    private async handleUpdate(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit();
        }
    }
}
