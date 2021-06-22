import EventEmmiter from 'events';

import type ChannelManager from './ChannelManager';
import type {ObjectData, QueryOptions} from './ChannelManager';
import i18nModelsInstance from '../i18n';
import {getObjectByIdHash} from 'one.core/lib/storage';
import {OEvent} from '../misc/OEvent';
import type {Model} from './Model';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';

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
export default class ConsentFileModel extends EventEmmiter implements Model {
    /**
     * Event is emitted when the consent file data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();
    public static readonly channelId = 'consentFile';

    channelManager: ChannelManager;
    private personId: SHA256IdHash<Person> | undefined;
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelManager = channelManager;
        this.personId = undefined;
    }

    setPersonId(id: SHA256IdHash<Person>): void {
        this.personId = id;
    }

    getOwnerId(): SHA256IdHash<Person> | undefined {
        return this.personId;
    }

    async getAnonymousEmail(): Promise<string> {
        if (this.personId === undefined) {
            throw new Error(i18nModelsInstance.t('errors:connectionModel.noInstance'));
        }

        const anonymousPerson = await getObjectByIdHash(this.personId);

        return anonymousPerson.obj.email;
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(ConsentFileModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Used to store the consent file of an user in one.
     * @param {ConsentFile} consentFile
     * @returns {Promise<void>}
     */
    async addConsentFile(consentFile: ConsentFile): Promise<void> {
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
     * @returns {Promise<ObjectData<ConsentFile>>}
     */
    async getOwnerConsentFile(): Promise<ObjectData<ConsentFile>> {
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
     * @param {DropoutFile} dropoutFile
     * @returns {Promise<void>}
     */
    async addDropoutFile(dropoutFile: DropoutFile): Promise<void> {
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
     * @returns {Promise<ObjectData<DropoutFile>>}
     */
    async getOwnerDropoutFile(): Promise<ObjectData<DropoutFile>> {
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
     * @returns {Promise<ObjectData<ConsentFile | DropoutFile>[]>}
     */
    async entries(): Promise<ObjectData<OneConsentFile>[]> {
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
        for await (const entry of this.channelManager.objectIteratorWithType('ConsentFile', {
            ...queryOptions,
            channelId: ConsentFileModel.channelId
        })) {
            yield entry;
        }
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === ConsentFileModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
