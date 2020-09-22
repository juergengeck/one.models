import ClientMatchingModel from "./ClientMatchingModel";
import InstancesModel from "../InstancesModel";
import ChannelManager from "../ChannelManager";
import {Supply, Demand} from '@OneCoreTypes';

export default class ServerUserModel extends ClientMatchingModel {

    constructor(instanceModel: InstancesModel, channelManager: ChannelManager
    ) {
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
                allobjects.push(demand)
            })
        });

        this.suppliesMap.forEach(allSupplies => {
            allSupplies.forEach(supply => {
                allobjects.push(supply);
            })
        })

        return [...new Set(allobjects)];
    }
}
