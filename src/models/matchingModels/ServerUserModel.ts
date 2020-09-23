import ClientMatchingModel, {MatchingEvents} from './ClientMatchingModel';
import InstancesModel from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import {Supply, Demand, UnversionedObjectResult} from '@OneCoreTypes';
import {serializeWithType} from 'one.core/lib/util/promise';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';

export default class ServerUserModel extends ClientMatchingModel {
    constructor(instanceModel: InstancesModel, channelManager: ChannelManager) {
        super(instanceModel, channelManager);
    }

    /**
     * Returns all existing tags, saved, but with all
     * information about them (match value, active status, and many more)
     * in case this information is required.
     *
     * @returns {Array<Supply | Demand>}
     */
    getAllAvailableTagsObjects(): Array<Supply | Demand> {
        const allobjects: (Supply | Demand)[] = [];

        this.demandsMap.forEach(allDemands => {
            allDemands.forEach(demand => {
                allobjects.push(demand);
            });
        });

        this.suppliesMap.forEach(allSupplies => {
            allSupplies.forEach(supply => {
                allobjects.push(supply);
            });
        });

        return [...new Set(allobjects)];
    }

    /**
     * This function is changing the status of a category,
     * more exactly, if this function is called for a tag, that tag will be
     * active or inactive for all user who ever sent this tag
     *
     * @param {string} supplyMatch
     * @returns {Promise<void>}
     */
    async changeSupplyCategoryStatus(supplyMatch: string): Promise<void> {
        // get all supplies
        const supplyArray = this.suppliesMap.get(supplyMatch);

        // check if there is a Supply object with the given match
        if (!supplyArray) {
            return;
        }

        await serializeWithType('Supply', async () => {
            // change the status for all existing supplies
            for (const supply of supplyArray) {
                // save new supply, but with 'isActive' status up to date
                const newSupply = (await createSingleObjectThroughPurePlan(
                    {
                        module: '@module/supply',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    {
                        $type$: 'Supply',
                        identity: this.anonInstancePersonEmail,
                        match: supplyMatch,
                        isActive: !supply.isActive,
                        timestamp: supply.timestamp
                    }
                )) as UnversionedObjectResult<Supply>;

                // delete the old version of the Supply object
                this.suppliesMap.delete(supply.match);

                // remember the new version of the Supply object
                await this.addNewValueToSupplyMap(newSupply.obj);
                await this.memoriseLatestVersionOfSupplyMap();

                await this.channelManager.postToChannel(this.channelId, newSupply.obj);
            }

            this.emit(MatchingEvents.SupplyUpdate);
        });
    }

    /**
     * This function is changing the status of a category,
     * more exactly, if this function is called for a tag, that tag will be
     * active or inactive for all user who ever sent this tag
     *
     * @param {string} supplyMatch
     * @returns {Promise<void>}
     */
    async changeDemandCategoryStatus(demandMatch: string): Promise<void> {
        // get all supplies
        const demandArray = this.demandsMap.get(demandMatch);

        // check if there is a Supply object with the given match
        if (!demandArray) {
            return;
        }

        await serializeWithType('Supply', async () => {
            // change the status for all existing supplies
            for (const demand of demandArray) {
                // save new supply, but with 'isActive' status up to date
                const newDemand = (await createSingleObjectThroughPurePlan(
                    {
                        module: '@module/demand',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    {
                        $type$: 'Demand',
                        identity: this.anonInstancePersonEmail,
                        match: demandMatch,
                        isActive: !demand.isActive,
                        timestamp: demand.timestamp
                    }
                )) as UnversionedObjectResult<Demand>;

                // delete the old version of the Supply object
                this.demandsMap.delete(demand.match);

                // remember the new version of the Supply object
                await this.addNewValueToDemandMap(newDemand.obj);
                await this.memoriseLatestVersionOfSupplyMap();

                await this.channelManager.postToChannel(this.channelId, newDemand.obj);
            }

            this.emit(MatchingEvents.DemandUpdate);
        });
    }
}
