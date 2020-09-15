import MatchingModel from './MatchingModel';
import InstancesModel from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import AccessModel from '../AccessModel';
import ConnectionsModel from '../ConnectionsModel';
import {
    Demand,
    MatchResponse,
    NotifiedUsers,
    Person,
    SHA256Hash,
    SHA256IdHash,
    Supply,
    UnversionedObjectResult,
    VersionedObjectResult
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdObj,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {serializeWithType} from 'one.core/lib/util/promise';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

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
     * @returns {Promise<void>}
     */
    async init() {
        await this.updateInstanceInfo();
        await this.initialiseMaps();
        await this.initNotifiedUsersList();

        await this.accessModel.createAccessGroup(this.accessGroupName);
        await this.connectionsModel.on(
            'chum_start',
            (localPersonId: SHA256IdHash<Person>, remotePersonId: SHA256IdHash<Person>) => {
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, localPersonId);
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, remotePersonId);
            }
        );

        await this.startMatchingChannel();
        await this.registerHooks();

        await this.accessModel.on('groups_updated', async () => {
            const accessGroup = await this.accessModel.getAccessGroupByName(this.accessGroupName);
            const personsToGiveAccessTo = this.anonInstanceInfo
                ? [...accessGroup.obj.person, this.anonInstanceInfo.personId]
                : accessGroup.obj.person;

            await this.giveAccessToMatchingChannel(personsToGiveAccessTo);
        });
    }

    // ################ PRIVATE API ################

    /**
     * When Supply and Demands objects are retrieved the server
     * has to remember them, post them in it's own channel and
     * check for a matching.
     *
     * @private
     */
    private async registerHooks(): Promise<void> {
        onUnversionedObj.addListener(async res => {
            console.log('object received:', res);
            if (res.obj.$type$ === 'CreationTime') {
                try {
                    const receivedObject = await getObject(res.obj.data);
                    if (receivedObject.$type$ === 'Supply') {
                        console.log('Supply Obj Received');
                        await this.channelManager.postToChannelIfNotExist(this.channelId, res.obj);
                        await this.identifyMatching(
                            receivedObject,
                            this.suppliesMap,
                            this.demandsMap
                        );
                    } else if (receivedObject.$type$ === 'Demand') {
                        console.log('Demand Obj Received');
                        await this.channelManager.postToChannelIfNotExist(this.channelId, res.obj);
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
     *
     * @returns {Promise<void>}
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
                        module: '@module/notifiedUsers',
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
     * @param {T} object
     * @param {Map<string, T[]>} sourceMap
     * @param {Map<string, Supply[] | Demand[]>} destinationMap
     * @returns {Promise<void>}
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
            allSourceClients.forEach((sourceObj: Supply | Demand) => {
                allDestinationClients.forEach(async (destinationObj: Supply | Demand) => {
                    if (sourceObj.isActive && destinationObj.isActive) {
                        await this.sendMatchResponse(sourceObj, destinationObj);
                        await this.sendMatchResponse(destinationObj, sourceObj);
                    }
                });
            });
        }
    }

    /**
     * Send a Match Response object to the corresponding persons.
     *
     * @param {Supply|Demand} source
     * @param {Supply|Demand} dest
     * @returns {Promise<UnversionedObjectResult>}
     */
    private async sendMatchResponse(
        source: Supply | Demand,
        dest: Supply | Demand
    ): Promise<UnversionedObjectResult<MatchResponse>> {
        const identityOfDemand = source.$type$ === 'Demand';
        const matchResponse = (await serializeWithType('MatchResponse', async () => {
            return await createSingleObjectThroughPurePlan(
                {
                    module: '@module/matchResponse',
                    versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
                },
                {
                    $type$: 'MatchResponse',
                    identity: source.identity,
                    match: source.match,
                    identityOfDemand
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
