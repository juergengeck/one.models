import EventEmmiter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import i18nModelsInstance from '../i18n';
import {getObjectByIdHash} from 'one.core/lib/storage';

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
export default class ConsentFileModel extends EventEmmiter {
    channelManager: ChannelManager;
    channelId: string;
    private personId: SHA256IdHash<Person> | undefined;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'consentFile';
        this.channelManager = channelManager;
        this.personId = undefined;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
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
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
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

        await this.channelManager.postToChannel(this.channelId, {
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
            channelId: this.channelId
        });

        const consentFiles: ObjectData<ConsentFile>[] = [];

        for (const consentFile of oneConsentFiles) {
            const {data, ...restObjectData} = consentFile;
            if (consentFile.data.fileType === FileType.Consent) {
                const consentInfos = consentFile.data.fileData.split(' ');
                consentFiles.push({
                    ...restObjectData,
                    data: {
                        personId: consentInfos[0] as SHA256IdHash<Person>,
                        version: consentInfos[1]
                    }
                });
            }
        }

        // any user is supposed to have just one consent file,
        // that's why the first element is returned (array length should be = 1)
        return consentFiles[0];
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

        await this.channelManager.postToChannel(this.channelId, {
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
            channelId: this.channelId
        });

        const dropoutFiles: ObjectData<DropoutFile>[] = [];

        for (const dropoutFile of oneDropoutFiles) {
            const {data, ...restObjectData} = dropoutFile;
            if (data.fileType === FileType.Dropout) {
                const dropoutInfos = data.fileData.split('|');
                dropoutFiles.push({
                    ...restObjectData,
                    data: {
                        personId: dropoutInfos[0] as SHA256IdHash<Person>,
                        reason: dropoutInfos[1],
                        date: dropoutInfos[2]
                    }
                });
            }
        }

        // any user is supposed to have just one dropout file,
        // that's why the first element is returned (array length should be = 1)
        return dropoutFiles[0];
    }

    /**
     * Used to retrieve both consent file and dropout file of an user.
     * @returns {Promise<ObjectData<ConsentFile | DropoutFile>[]>}
     */
    async entries(): Promise<ObjectData<ConsentFile | DropoutFile>[]> {
        const files: ObjectData<ConsentFile | DropoutFile>[] = [];

        const onConsentFileObjects = await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: this.channelId
        });

        for (const oneObject of onConsentFileObjects) {
            const {data, ...restObjectData} = oneObject;
            if (data.fileType === FileType.Consent) {
                const consentInfos = data.fileData.split(' ');
                if (consentInfos[0] === this.personId) {
                    files.push({
                        ...restObjectData,
                        data: {
                            personId: consentInfos[0] as SHA256IdHash<Person>,
                            version: consentInfos[1]
                        }
                    });
                }
            } else if (data.fileType === FileType.Dropout) {
                const dropoutInfos = data.fileData.split('|');
                if (dropoutInfos[0] === this.personId) {
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
        }

        return files;
    }

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
