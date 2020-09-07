import MatchingModel from './MatchingModel';
import InstancesModel from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import AccessModel from '../AccessModel';
import ConnectionsModel from '../ConnectionsModel';
import {Person, SHA256IdHash} from '@OneCoreTypes';

export default class ServerMatchingModel extends MatchingModel {
    private accessGroupName = 'matching';
    private connectionsModel: ConnectionsModel;
    private accessModel: AccessModel;

    constructor(
        instancesModel: InstancesModel,
        channelManager: ChannelManager,
        connectionsModel: ConnectionsModel,
        accessModel: AccessModel
    ) {
        super(instancesModel, channelManager);
        this.connectionsModel = connectionsModel;
        this.accessModel = accessModel;
    }

    async init() {
        // initialise application resources
        await this.updateInstanceInfo();
        await this.accessModel.createAccessGroup(this.accessGroupName);
        await this.connectionsModel.on(
            'chum_start',
            (localPersonId: SHA256IdHash<Person>, remotePersonId: SHA256IdHash<Person>) => {
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, localPersonId);
                this.accessModel.addPersonToAccessGroup(this.accessGroupName, remotePersonId);
            }
        );

        // start the channels and add listeners for specific objects
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

    private async registerHooks(): Promise<void> {}
}
