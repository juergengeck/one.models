import MatchingModel from './MatchingModel';
import type InstancesModel from '../InstancesModel';
import type ChannelManager from '../ChannelManager';
import type AccessModel from '../AccessModel';
import type ConnectionsModel from '../ConnectionsModel';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdObj,
    onUnversionedObj,
    SET_ACCESS_MODE,
    UnversionedObjectResult,
    VERSION_UPDATES,
    VersionedObjectResult
} from 'one.core/lib/storage';
import {serializeWithType} from 'one.core/lib/util/promise';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import type {Demand, MatchResponse, NotifiedUsers, Supply} from '../../recipes/MatchingRecipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';

/**
 * Inheriting the common behaviour from the Matching Model class, this
 * class implements the specific behaviour for the matching server.
 *
 * @description Server Matching Model class
 * @augments MatchingModel
 */
export default class ServerMatchingModel extends MatchingModel {
    private accessGroupName = 'matching';
    private connectionsModel: ConnectionsModel;
    private accessModel: AccessModel;

    private notifiedUsersName = 'NotifiedUsers';
    private notifiedUsersObj: VersionedObjectResult<NotifiedUsers>;

    constructor(
        instancesModel: InstancesModel,
        channelManager: ChannelManager,
        connectionsModel: ConnectionsModel,
        accessModel: AccessModel
    ) {
        super(instancesModel, channelManager);
        this.connectionsModel = connectionsModel;
        this.accessModel = accessModel;
        this.notifiedUsersObj = {} as VersionedObjectResult<NotifiedUsers>;
    }

    /**
     * 1. initialise application resources (all maps that are used to memorising
     * the data) and load the instance information in memory.
     * Create an access group for all clients of the matching server in order to
     * give access to all of them at once on the channel.
     *
     * 2. start the channels and add listeners for specific objects
     *
     * 3. share the channel with the matching clients
     *
     */
    async init() {
        this.state.assertCurrentState('Uninitialised');

        await this.updateInstanceInfo();
        await this.initialiseMaps();
        await this.initNotifiedUsersList();

        await this.accessModel.createAccessGroup(this.accessGroupName);
        await this.connectionsModel.onChumStart(
            (localPersonId: SHA256IdHash<Person>, remotePersonId: SHA256IdHash<Person>) => {
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, localPersonId);
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, remotePersonId);
            }
        );

        await this.startMatchingChannel();
        await this.registerHooks();

        await this.accessModel.onGroupsUpdated(async () => {
            const accessGroup = await this.accessModel.getAccessGroupByName(this.accessGroupName);
            const personsToGiveAccessTo = this.anonInstanceInfo
                ? [...accessGroup.obj.person, this.anonInstanceInfo.personId]
                : accessGroup.obj.person;

            await this.giveAccessToMatchingChannel(personsToGiveAccessTo);
        });

        this.state.triggerEvent('init');
    }

    // ################ PRIVATE API ################

    /**
     * When Supply and Demands objects are retrieved the server
     * has to remember them, post them in it's own channel and
     * check for a matching.
     */
    private async registerHooks(): Promise<void> {
        onUnversionedObj.addListener(async res => {
            if (res.obj.$type$ === 'CreationTime') {
                try {
                    const receivedObject = await getObject(res.obj.data);
                    if (receivedObject.$type$ === 'Supply') {
                        console.log('Supply Obj Received:', receivedObject);
                        await this.channelManager.postToChannelIfNotExist(
                            MatchingModel.channelId,
                            res.obj
                        );
                        await this.identifyMatching(
                            receivedObject,
                            this.suppliesMap,
                            this.demandsMap
                        );
                    } else if (receivedObject.$type$ === 'Demand') {
                        console.log('Demand Obj Received:', receivedObject);
                        await this.channelManager.postToChannelIfNotExist(
                            MatchingModel.channelId,
                            res.obj
                        );
                        await this.identifyMatching(
                            receivedObject,
                            this.demandsMap,
                            this.suppliesMap
                        );
                    }
                } catch (err) {
                    if (err.name !== 'FileNotFoundError') {
                        throw err;
                    }
                }
            }
        });
    }

    /**
     * Initialising the notified users object in order to load all
     * data about the previously notified users.
     */
    private async initNotifiedUsersList(): Promise<void> {
        try {
            this.notifiedUsersObj = (await getObjectByIdObj({
                $type$: 'NotifiedUsers',
                name: this.notifiedUsersName
            })) as VersionedObjectResult<NotifiedUsers>;
        } catch (err) {
            if (err.name === 'FileNotFoundError') {
                this.notifiedUsersObj = (await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    {
                        $type$: 'NotifiedUsers',
                        name: this.notifiedUsersName,
                        existingMatches: new Map<
                            SHA256IdHash<Person>,
                            Set<SHA256Hash<MatchResponse>>
                        >()
                    }
                )) as VersionedObjectResult<NotifiedUsers>;
            } else {
                throw err;
            }
        }
    }

    /**
     * Search for a match in the available Supply and Demand objects.
     *
     * @param object
     * @param sourceMap
     * @param destinationMap
     * @private
     */
    private async identifyMatching<T extends Demand | Supply>(
        object: T,
        sourceMap: Map<string, T[]>,
        destinationMap: Map<string, Supply[] | Demand[]>
    ): Promise<void> {
        if (object.$type$ === 'Supply') {
            this.addNewValueToSupplyMap(object as Supply);
            await this.memoriseLatestVersionOfSupplyMap();
        } else {
            this.addNewValueToDemandMap(object as Demand);
            await this.memoriseLatestVersionOfDemandMap();
        }

        const allDestinationClients = destinationMap.get(object.match);
        const allSourceClients = sourceMap.get(object.match);

        if (allDestinationClients && allSourceClients) {
            const latestSourceTimestamp = allSourceClients[allSourceClients.length - 1];
            const latestDestinationTimestamp =
                allDestinationClients[allDestinationClients.length - 1];

            if (latestSourceTimestamp.isActive && latestDestinationTimestamp.isActive) {
                await this.sendMatchResponse(latestSourceTimestamp, latestDestinationTimestamp);
                await this.sendMatchResponse(latestDestinationTimestamp, latestSourceTimestamp);
            }
        }
    }

    /**
     * Send a Match Response object to the corresponding persons.
     *
     * @param source
     * @param dest
     * @returns
     */
    private async sendMatchResponse(
        source: Supply | Demand,
        dest: Supply | Demand
    ): Promise<UnversionedObjectResult<MatchResponse>> {
        const identityOfDemand = source.$type$ === 'Demand';
        const matchResponse = (await serializeWithType('MatchResponse', async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'MatchResponse',
                    identity: source.identity,
                    match: source.match,
                    identityOfDemand,
                    creationTimestamp: Date.now()
                }
            );
        })) as UnversionedObjectResult<MatchResponse>;

        const destPerson = await calculateIdHashOfObj({
            $type$: 'Person',
            email: dest.identity
        });

        const identities = matchResponse.hash;
        let existingMatchesMap = this.notifiedUsersObj.obj.existingMatches;
        const allMatches = existingMatchesMap
            ? new Set(existingMatchesMap.get(destPerson))
            : new Set<SHA256Hash<MatchResponse>>();

        if (allMatches && allMatches.has(identities)) {
            return matchResponse;
        }

        const existingMatches = allMatches
            ? allMatches.add(identities)
            : new Set<SHA256Hash<MatchResponse>>().add(identities);

        if (!existingMatchesMap) {
            existingMatchesMap = new Map<SHA256IdHash<Person>, Set<SHA256Hash<MatchResponse>>>();
        }
        existingMatchesMap.set(destPerson, existingMatches);

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: matchResponse.hash,
                    person: [destPerson],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );

        console.log('Match Response sent to ', dest.$type$, ' client');

        if (this.notifiedUsersObj) {
            await serializeWithType(this.notifiedUsersObj.idHash, async () => {
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@module/notifiedUsers',
                        versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                    },
                    {
                        ...this.notifiedUsersObj.obj,
                        existingMatches: existingMatchesMap
                    }
                );
            });
        }

        return matchResponse;
    }
}
