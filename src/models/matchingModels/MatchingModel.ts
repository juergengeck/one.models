import EventEmitter from 'events';
import InstancesModel, {LocalInstanceInfo} from '../InstancesModel';
import ChannelManager from '../ChannelManager';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdHash,
    SET_ACCESS_MODE
} from 'one.core/lib/storage';

/**
 *
 * @description Matching Model class
 * @augments EventEmitter
 */
export default abstract class MatchingModel extends EventEmitter {
    protected instancesModel: InstancesModel;
    protected channelManager: ChannelManager;
    protected anonInstanceInfo: LocalInstanceInfo | null;
    protected channelId = 'matching';

    protected constructor(instancesModel: InstancesModel, channelManager: ChannelManager) {
        super();
        this.instancesModel = instancesModel;
        this.channelManager = channelManager;
        this.anonInstanceInfo = null;
    }

    abstract async init(): Promise<void>;

    protected async startMatchingChannel(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

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

    protected async giveAccessToMatchingChannel(person: SHA256IdHash<Person>[]): Promise<void> {
        // Apply the access rights
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
