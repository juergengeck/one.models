import MatchingModel from './MatchingModel';
import {
    createManyObjectsThroughPurePlan,
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    getObjectByIdObj,
    onUnversionedObj,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {
    UnversionedObjectResult,
    Supply,
    Demand,
    SHA256IdHash,
    Person,
    Contact,
    VersionedObjectResult,
    MatchMap,
    MatchResponse
} from '@OneCoreTypes';
import InstancesModel from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import matchingContact from '../../../lib/models/matching_contact/matching_public_contact.json';

/**
 * This represents a MatchingEvents
 * @enum
 *       CatalogUpdate -> updates the catalog tags everytime a new supply or a demand is added
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
 * Inheriting the common behaviour from the Matching Model class, this
 * class implements the specific behaviour for the client of the matching
 * server.
 *
 * The identity of the matching server is read from the json file and the
 * Contact object is memorised in order to establish a connection between
 * the client and the server.
 *
 * @description Client Matching Model class
 * @augments MatchingModel
 */
export default class ClientMatchingModel extends MatchingModel {
    private matchMapName = 'MatchMap';

    private anonInstancePersonEmail: string | null;
    private matchingServerPersonIdHash: SHA256IdHash<Person> | undefined;

    constructor(instancesModel: InstancesModel, channelManager: ChannelManager) {
        super(instancesModel, channelManager);
        this.anonInstancePersonEmail = null;
        this.matchingServerPersonIdHash = undefined;
    }

    /**
     * 1. read the matching server details from the json file and memorise
     * the corresponding Contact object in order to establish a connection
     * with it.
     *
     * 2. initialise application resources (all maps that are used to memorising
     * the data) and load the instance information in memory.
     *
     * 3. start the channels and add listeners for specific objects
     *
     * 4. share the channel with the matching server
     *
     * @returns {Promise<void>}
     */
    async init() {
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

        await this.initialiseMaps();
        await this.updateInstanceInfo();

        if (this.anonInstanceInfo && this.anonInstanceInfo.personId) {
            const person = (await getObjectByIdHash(
                this.anonInstanceInfo.personId
            )) as VersionedObjectResult<Person>;

            this.anonInstancePersonEmail = person.obj.email;
        }

        await this.startMatchingChannel();
        await this.registerHooks();

        const personsToGiveAccessTo = this.anonInstanceInfo
            ? [this.matchingServerPersonIdHash, this.anonInstanceInfo.personId]
            : [this.matchingServerPersonIdHash];
        await this.giveAccessToMatchingChannel(personsToGiveAccessTo);
    }

    /**
     * Given the match value a Supply object is created and posted to the channel.
     *
     * @param {string} supplyInput
     * @returns {Promise<void>}
     */
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

        // remember the Supply object that was created
        this.addNewValueToSupplyMap(supply.obj);
        await this.memoriseLatestVersionOfSupplyMap();

        await this.channelManager.postToChannel(this.channelId, supply.obj);

        this.emit(MatchingEvents.SupplyUpdate);
    }

    /**
     * Given the match value a Demand object is created and posted to the channel.
     *
     * @param {string} demandInput
     * @returns {Promise<void>}
     */
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

        // remember the Demand object that was created
        this.addNewValueToDemandMap(demand.obj);
        await this.memoriseLatestVersionOfDemandMap();

        await this.channelManager.postToChannel(this.channelId, demand.obj);

        this.emit(MatchingEvents.DemandUpdate);
    }

    /**
     * Return all Supply objects that were created by myself.
     *
     * @returns {Supply[]}
     */
    getMySupplies(): Supply[] {
        const mySupplies: Supply[] = [];
        this.suppliesMap.forEach(supplyArray => {
            supplyArray.forEach(supplyObj => {
                if (supplyObj.identity === this.anonInstancePersonEmail) {
                    mySupplies.push(supplyObj);
                }
            });
        });

        return mySupplies;
    }

    /**
     * Return all Demands objects that were created by myself.
     *
     * @returns {Demand[]}
     */
    getMyDemands(): Demand[] {
        const myDemands: Demand[] = [];
        this.demandsMap.forEach(demandArray => {
            demandArray.forEach(demandObj => {
                if (demandObj.identity === this.anonInstancePersonEmail) {
                    myDemands.push(demandObj);
                }
            });
        });

        return myDemands;
    }

    /**
     * Returns all existing match property that correspond to the
     * Supply and Demand objects found (created by myself and
     * retrieved from the matching server via channels).
     *
     * @returns {Array<string>}
     */
    getAllAvailableSuppliesAndDemands(): Array<string> {
        const allObjects: string[] = [];
        this.demandsMap.forEach(allDemands => {
            allDemands.forEach(demand => {
                allObjects.push(demand.match);
            });
        });
        this.suppliesMap.forEach(allSupplies => {
            allSupplies.forEach(supply => {
                allObjects.push(supply.match);
            });
        });

        return [...new Set(allObjects)];
    }

    /**
     * Returns the array with all existing matches for this instance.
     *
     * @returns {Promise<MatchResponse[]>}
     */
    async getAllMatchResponses(): Promise<MatchResponse[]> {
        let matchMap: MatchResponse[] = [];

        try {
            const matchMapObj = (await getObjectByIdObj({
                $type$: 'MatchMap',
                name: this.matchMapName
            })) as VersionedObjectResult<MatchMap>;

            if (matchMapObj.obj.array) {
                matchMap = matchMapObj.obj.array;
            }
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.name !== 'FileNotFoundError') {
                throw error;
            }
        }

        return matchMap;
    }

    /**
     * For the Supply objects that were created by myself I
     * have complete control over them so I can also delete
     * an object and remove it from the list, but the object
     * will still be visible in the server list.
     *
     * @param {string} supplyValue
     * @returns {Promise<void>}
     */
    async deleteSupply(supplyValue: string): Promise<void> {
        this.suppliesMap.delete(supplyValue);
        await this.memoriseLatestVersionOfSupplyMap();
        this.emit(MatchingEvents.SupplyUpdate);
    }

    /**
     * For the Demand objects that were created by myself I
     * have complete control over them so I can also delete
     * an object and remove it from the list, but the object
     * will still be visible in the server list.
     *
     * @param {string} demandValue
     * @returns {Promise<void>}
     */
    async deleteDemand(demandValue: string): Promise<void> {
        this.demandsMap.delete(demandValue);
        await this.memoriseLatestVersionOfDemandMap();
        this.emit(MatchingEvents.DemandUpdate);
    }

    /**
     * This function changes the status of a Supply from active to
     * inactive or the other way depending on the actual status of
     * the tag and the user clicking on it.
     *
     * @param {string} supplyMatch
     * @returns {Promise<void>}
     */
    async changeSupplyStatus(supplyMatch: string): Promise<void> {
        const supplyArray = this.suppliesMap.get(supplyMatch);

        if (supplyArray) {
            for (const supplyObj of supplyArray) {
                if (supplyObj.identity === this.anonInstancePersonEmail) {
                    const newSupply = (await createSingleObjectThroughPurePlan(
                        {
                            module: '@module/supply',
                            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                        },
                        {
                            $type$: 'Supply',
                            identity: this.anonInstancePersonEmail,
                            match: supplyMatch,
                            isActive: supplyObj ? !supplyObj.isActive : false,
                            timestamp: Date.now()
                        }
                    )) as UnversionedObjectResult<Supply>;

                    this.addNewValueToSupplyMap(newSupply.obj);
                    await this.memoriseLatestVersionOfSupplyMap();
                    await this.channelManager.postToChannel(this.channelId, newSupply.obj);
                    this.emit(MatchingEvents.SupplyUpdate);
                }
            }
        }
    }

    /**
     * This function changes the status of a Demand from active to
     * inactive or the other way depending on the actual status of
     * the tag and the user clicking on it.
     *
     * @param {string} value
     * @returns {Promise<void>}
     */
    async changeDemandStatus(value: string): Promise<void> {
        const demandArray = this.demandsMap.get(value);

        if (demandArray) {
            for (const demandObj of demandArray) {
                if (demandObj.identity === this.anonInstancePersonEmail) {
                    const newDemand = (await createSingleObjectThroughPurePlan(
                        {
                            module: '@module/demand',
                            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                        },
                        {
                            $type$: 'Demand',
                            identity: this.anonInstancePersonEmail,
                            match: value,
                            isActive: demandObj ? !demandObj.isActive : false.valueOf(),
                            timestamp: Date.now()
                        }
                    )) as UnversionedObjectResult<Demand>;

                    this.addNewValueToDemandMap(newDemand.obj);
                    await this.memoriseLatestVersionOfDemandMap();
                    await this.channelManager.postToChannel(this.channelId, newDemand.obj);
                    this.emit(MatchingEvents.DemandUpdate);
                }
            }
        }
    }

    // ################ PRIVATE API ################

    /**
     * When MatchResponse, Supply and Demands objects are retrieved the client
     * has to remember them and emit the corresponding event type.
     *
     * @private
     */
    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (caughtObject.obj.$type$ === 'MatchResponse' && caughtObject.status === 'new') {
                await this.memoriseMatchResponse(caughtObject.obj);
            }
            if (caughtObject.obj.$type$ === 'Supply') {
                let existingSupplies = this.suppliesMap.get(caughtObject.obj.match);

                if (!existingSupplies) {
                    existingSupplies = [];
                }
                existingSupplies.push(caughtObject.obj);
                this.suppliesMap.set(caughtObject.obj.match, existingSupplies);

                this.emit(MatchingEvents.CatalogUpdate);
            }
            if (caughtObject.obj.$type$ === 'Demand') {
                let existingDemands = this.demandsMap.get(caughtObject.obj.match);

                if (!existingDemands) {
                    existingDemands = [];
                }
                existingDemands.push(caughtObject.obj);
                this.demandsMap.set(caughtObject.obj.match, existingDemands);

                this.emit(MatchingEvents.CatalogUpdate);
            }
        });
    }

    /**
     * When a match is found the result is memorised so the user
     * can be notified about it's latest match even after application
     * reload.
     *
     * @param {MatchResponse} matchResponse
     * @returns {Promise<void>}
     */
    private async memoriseMatchResponse(matchResponse: MatchResponse): Promise<void> {
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
                name: this.matchMapName
            })) as VersionedObjectResult<MatchMap>;

            await createSingleObjectThroughPurePlan(
                {
                    module: '@module/matchMap',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'MatchMap',
                    name: this.matchMapName,
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
                    name: this.matchMapName,
                    array: [savedMatchResponse.obj.match + '|' + savedMatchResponse.obj.identity]
                }
            );
        }
        this.emit(MatchingEvents.MatchUpdate);
    }
}
