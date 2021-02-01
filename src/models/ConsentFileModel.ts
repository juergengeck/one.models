import EventEmmiter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import i18nModelsInstance from '../i18n';
import {getObjectByIdHash} from 'one.core/lib/storage';

// export enum FileType {
//     Consent = 'consent',
//     Dropout = 'dropout'
// }
//
// /**
//  * This represents the model of a consent file
//  *
//  */
// export type ConsentFile = {
//     fileData: string;
//     fileType: string;
// };

export type ConsentFile = {
    personId: SHA256IdHash<Person>;
    version?: string;
};
// separated by " "

export type DropoutFile = {
    personId: SHA256IdHash<Person>;
    reason: string;
    date: string;
};
// separated by |

// /**
//  * Convert from model representation to one representation.
//  *
//  *  @param {ConsentFile} modelObject - the model object
//  * @returns {OneConsentFile} The corresponding one object
//  *
//  */
// function convertToOne(modelObject: ConsentFile): OneConsentFile {
//     // Create the resulting object
//     return {
//         $type$: 'ConsentFile',
//         fileData: modelObject.fileData,
//         fileType: modelObject.fileType
//     };
// }
//
// function convertFromOne(oneObject: OneConsentFile): ConsentFile {
//     // Create the new ObjectData item
//     return {fileType: oneObject.fileType, fileData: oneObject.fileData};
// }

/**
 * This model implements the possibility to add new consent file to the journal
 *
 */
export default class ConsentFileModel extends EventEmmiter {
    channelManager: ChannelManager;
    channelId: string;
    private personId: SHA256IdHash<Person> | undefined;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;
    // private readonly consentDocumentVersion: string;

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
        // this.consentDocumentVersion = consentDocumentVersion;
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

    async addConsentFile(consentFile: ConsentFile): Promise<void> {
        if (!consentFile) {
            throw new Error('The file is empty.');
        }

        // const consentFile: ConsentFile =
        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'ConsentFile',
            personId: consentFile.personId,
            version: consentFile.version
        });
    }

    async getOwnerConsentFile(): Promise<ObjectData<ConsentFile>> {
        const oneConsentFiles = await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: this.channelId
        });

        // any user is supposed to have just one consent file so if you are logged in,
        // in one will be just your file and that's why this function returns just the first object of the consent array
        return oneConsentFiles[0];
    }

    async addDropoutFile(dropoutFile: DropoutFile): Promise<void> {
        if (!dropoutFile) {
            throw new Error('The file is empty.');
        }

        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'DropoutFile',
            personId: dropoutFile.personId,
            reason: dropoutFile.reason,
            date: dropoutFile.date
        });
    }

    async getOwnerDropoutFile(): Promise<ObjectData<DropoutFile>> {
        const oneObjects = await this.channelManager.getObjectsWithType('DropoutFile', {
            channelId: this.channelId
        });

        // any user is supposed to have just one dropout study file so if you are logged in,
        // in one will be just your file and that's why this function returns just the first object of the consent array
        return oneObjects[0];
    }

    async entries(): Promise<ObjectData<ConsentFile | DropoutFile>[]> {
        const objects: ObjectData<ConsentFile | DropoutFile>[] = [];

        const consentFileObjects = await this.channelManager.getObjectsWithType('ConsentFile', {
            channelId: this.channelId
        });

        const dropoutFileObjects = await this.channelManager.getObjectsWithType('DropoutFile', {
            channelId: this.channelId
        });

        for (const consentFile of consentFileObjects) {
            if (consentFile.data.personId === this.personId) {
                objects.push(consentFile);
            }
        }

        for (const dropoutFile of dropoutFileObjects) {
            if (dropoutFile.data.personId === this.personId) {
                objects.push(dropoutFile);
            }
        }

        return objects;
    }

    // async addConsentFile(consentFile: ConsentFile): Promise<void> {
    //     if (!consentFile) {
    //         throw new Error('empty file');
    //     }
    //
    //     // if it's consent file then add the version of it
    //     if (consentFile.fileType === FileType.Consent) {
    //         consentFile.fileData += ' ' + this.consentDocumentVersion;
    //     }
    //
    //     await this.channelManager.postToChannel(this.channelId, convertToOne(consentFile));
    // }

    // async entries(): Promise<ObjectData<ConsentFile>[]> {
    //     const objects: ObjectData<ConsentFile>[] = [];
    //
    //     const oneObjects = await this.channelManager.getObjectsWithType('ConsentFile', {
    //         channelId: this.channelId
    //     });
    //
    //     for (const oneObject of oneObjects) {
    //         const {data, ...restObjectData} = oneObject;
    //
    //         // get the person id hash and the version of the consent document from the fileData
    //         const objectFileData = data.fileData.split(' ');
    //
    //         // For consent and dropout files check if the owner is the same as the current
    //         // instance owner. Consent files will be shared with partner just for backup
    //         // purpose so in partner journal page should not be visible.
    //
    //         if (data.fileType === 'consent' && objectFileData[0] === this.personId) {
    //             objects.push({...restObjectData, data: convertFromOne(data)});
    //         } else if (data.fileType === 'dropout') {
    //             const dropoutFileData = new Buffer(data.fileData, 'base64').toString('ascii');
    //
    //             if (dropoutFileData.split('|')[1].split(':')[1].trim() === this.personId) {
    //                 objects.push({...restObjectData, data: convertFromOne(data)});
    //             }
    //         }
    //     }
    //
    //     return objects;
    // }

    // async getOwnerConsentFile(): Promise<ObjectData<ConsentFile>> {
    //     const objects: ObjectData<ConsentFile>[] = [];
    //     const oneObjects = await this.channelManager.getObjectsWithType('ConsentFile', {
    //         channelId: this.channelId
    //     });
    //
    //     for (const oneObject of oneObjects) {
    //         const {data, ...restObjectData} = oneObject;
    //         const dataFromOne = convertToOne(data);
    //
    //         if (dataFromOne.fileType === FileType.Consent) {
    //             objects.push({...restObjectData, data: convertFromOne(data)});
    //         }
    //     }
    //
    //     // any user is sopose to heve just one consent file so if you are logged in,
    //     // in one will be just your file and that's why this function returns just the first object of the consent array
    //     return objects[0];
    // }

    // async getOwnerDropoutFile(): Promise<ObjectData<ConsentFile>> {
    //     const objects: ObjectData<ConsentFile>[] = [];
    //
    //     const oneObjects = await this.channelManager.getObjectsWithType('ConsentFile', {
    //         channelId: this.channelId
    //     });
    //
    //     for (const oneObject of oneObjects) {
    //         const {data, ...restObjectData} = oneObject;
    //         const dataFromOne = convertToOne(data);
    //
    //         if (dataFromOne.fileType === FileType.Dropout) {
    //             objects.push({...restObjectData, data: convertFromOne(data)});
    //         }
    //     }
    //
    //     // any user is suppose to have just one consent file so if you are logged in,
    //     // in one will be just your file and that's why this function returns just the first object of the consent array
    //     return objects[0];
    // }

    // async getEntryById(id: string): Promise<ObjectData<ConsentFile>> {
    //     const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
    //         id,
    //         'ConsentFile'
    //     );
    //     return {...restObjectData, data: convertFromOne(data)};
    // }

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
