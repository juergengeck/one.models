import EventEmmiter from 'events';

import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import i18nModelsInstance from '../i18n';
import {getObjectByIdHash} from 'one.core/lib/storage';
import {OEvent} from '../misc/OEvent';
import type {ConsentFile as OneConsentFile} from '../recipes/ConsentFileRecipes';
import type {Model} from './Model';
import {createModelStateMachine} from './Model';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {StateMachine} from '../misc/StateMachine';

/**
 * Represents the consent file object that will be stored in one.
 */
export type ConsentFile = {
    personId: SHA256IdHash<Person>;
    version?: string;
};

/**
 * Represents the dropout file object that will be stored in one.
 */
export type DropoutFile = {
    personId: SHA256IdHash<Person>;
    reason: string;
    date: string;
};

export enum FileType {
    Consent = 'consent',
    Dropout = 'dropout'
}

/**
 * This model implements the possibility to store and load the consent file and the dropout file of an user.
 */
export default class ConsentFileModel implements Model {
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    // Event is emitted when the consent file data is updated.
    public onUpdated = new OEvent<(data: ObjectData<unknown>) => void>();

    channelManager: ChannelManager;
    public static readonly channelId = 'consentFile';
    private personId: SHA256IdHash<Person> | undefined;
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        this.channelManager = channelManager;
        this.personId = undefined;
        this.state = createModelStateMachine();
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(ConsentFileModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
        this.state.triggerEvent('init');
    }

    setPersonId(id: SHA256IdHash<Person>): void {
        this.state.assertCurrentState('Initialised');
        this.personId = id;
    }

    getOwnerId(): SHA256IdHash<Person> | undefined {
        this.state.assertCurrentState('Initialised');
        return this.personId;
    }

    async getAnonymousEmail(): Promise<string> {
        this.state.assertCurrentState('Initialised');
        if (this.personId === undefined) {
            throw new Error(i18nModelsInstance.t('errors:connectionModel.noInstance'));
        }

        const anonymousPerson = await getObjectByIdHash(this.personId);

        return anonymousPerson.obj.email;
    }

    /**
     * Shutdown module
     */
    async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    /**
     * Used to store the consent file of an user in one.
     * @param consentFile
     */
    async addConsentFile(consentFile: ConsentFile): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (!consentFile) {
            throw new Error('The file is empty.');
        }

        await this.channelManager.postToChannel(ConsentFileModel.channelId, {
            $type$: 'ConsentFile',
            fileData: consentFile.personId + ' ' + consentFile.version,
            fileType: FileType.Consent
        });
    }

    /**
     * Used to retrieve the user consent file from one.
     * @returns
     */
    async getOwnerConsentFile(): Promise<ObjectData<ConsentFile>> {
        this.state.assertCurrentState('Initialised');

        const oneConsentFiles = await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: ConsentFileModel.channelId
        });

        for (const consentFile of oneConsentFiles) {
            const {data, ...restObjectData} = consentFile;
            if (data.fileType === FileType.Consent) {
                const consentInfos = data.fileData.split(' ');
                return {
                    ...restObjectData,
                    data: {
                        personId: consentInfos[0] as SHA256IdHash<Person>,
                        version: consentInfos[1]
                    }
                };
            }
        }

        // happens when the registration process is interrupted
        throw new Error('Consent file not found.');
    }

    /**
     * Used to store the dropout file of an user in one.
     * @param dropoutFile
     */
    async addDropoutFile(dropoutFile: DropoutFile): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (!dropoutFile) {
            throw new Error('The file is empty.');
        }

        await this.channelManager.postToChannel(ConsentFileModel.channelId, {
            $type$: 'ConsentFile',
            fileData: dropoutFile.personId + '|' + dropoutFile.reason + '|' + dropoutFile.date,
            fileType: FileType.Dropout
        });
    }

    /**
     * Used to retrieve the user dropout file from one.
     * @returns
     */
    async getOwnerDropoutFile(): Promise<ObjectData<DropoutFile>> {
        this.state.assertCurrentState('Initialised');

        const oneDropoutFiles = await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: ConsentFileModel.channelId
        });

        for (const dropoutFile of oneDropoutFiles) {
            const {data, ...restObjectData} = dropoutFile;
            if (data.fileType === FileType.Dropout) {
                const dropoutInfos = data.fileData.split('|');
                if (dropoutInfos.length === 3) {
                    return {
                        ...restObjectData,
                        data: {
                            personId: dropoutInfos[0] as SHA256IdHash<Person>,
                            reason: dropoutInfos[1],
                            date: dropoutInfos[2]
                        }
                    };
                }
                throw new Error('The information of the dropout file is corrupted.');
            }
        }

        throw new Error('No dropout file found');
    }

    /**
     * This function transforms an array of {@link ObjectData<OneConsentFile>[]} to {@link ObjectData<ConsentFile | DropoutFile>[]}
     * @param oneConsentFiles
     * @param filterOthersConsentFiles by enabling this, you will get only {@link this.personId}'s ConsentFiles
     */
    public formatEntries(
        oneConsentFiles: ObjectData<OneConsentFile>[],
        filterOthersConsentFiles: boolean = true
    ): ObjectData<ConsentFile | DropoutFile>[] {
        this.state.assertCurrentState('Initialised');

        const files: ObjectData<ConsentFile | DropoutFile>[] = [];

        for (const oneObject of oneConsentFiles) {
            const {data, ...restObjectData} = oneObject;
            if (data.fileType === FileType.Consent) {
                const consentInfos = data.fileData.split(' ');
                if (filterOthersConsentFiles && consentInfos[0] !== this.personId) {
                    continue;
                }
                files.push({
                    ...restObjectData,
                    data: {
                        personId: consentInfos[0] as SHA256IdHash<Person>,
                        version: consentInfos[1]
                    }
                });
            } else if (data.fileType === FileType.Dropout) {
                const dropoutInfos = data.fileData.split('|');
                if (dropoutInfos.length !== 3) {
                    throw new Error('The information of the dropout file is corrupted.');
                }
                if (filterOthersConsentFiles && dropoutInfos[0] !== this.personId) {
                    continue;
                }
                files.push({
                    ...restObjectData,
                    data: {
                        personId: dropoutInfos[0] as SHA256IdHash<Person>,
                        reason: dropoutInfos[1],
                        date: dropoutInfos[2]
                    }
                });
            }
        }
        return files;
    }

    /**
     * Retrieves entries
     * @returns
     */
    async entries(): Promise<ObjectData<OneConsentFile>[]> {
        this.state.assertCurrentState('Initialised');

        return await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: ConsentFileModel.channelId
        });
    }

    /**
     * returns iterator for Consent files or Dropout Files
     * @param queryOptions
     */
    async *entriesIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneConsentFile>> {
        this.state.assertCurrentState('Initialised');

        for await (const entry of this.channelManager.objectIteratorWithType('ConsentFile', {
            ...queryOptions,
            channelId: ConsentFileModel.channelId
        })) {
            yield entry;
        }
    }

    /**
     *  Handler function for the 'updated' event
     * @param id
     * @param owner
     * @param data
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === ConsentFileModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
