import EventEmmiter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {ConsentFile as OneConsentFile} from '@OneCoreTypes';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';

export enum FileType {
    Consent = 'consent',
    Dropout = 'dropout'
}

/**
 * This represents the model of a consent file
 *
 */
export type ConsentFile = {
    fileData: string;
    fileType: string;
};

/**
 * Convert from model representation to one representation.
 *
 *  @param {ConsentFile} modelObject - the model object
 * @returns {OneConsentFile} The corresponding one object
 *
 */

function convertToOne(modelObject: ConsentFile): OneConsentFile {
    // Create the resulting object
    return {
        $type$: 'ConsentFile',
        fileData: modelObject.fileData,
        fileType: modelObject.fileType
    };
}

function convertFromOne(oneObject: OneConsentFile): ConsentFile {
    // Create the new ObjectData item
    return {fileType: oneObject.fileType, fileData: oneObject.fileData};
}

/**
 * This model implements the posibility to add new consent file to the journal
 *
 */
export default class ConsentFileModel extends EventEmmiter {
    channelManager: ChannelManager;
    channelId: string;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'consentFile';
        this.channelManager = channelManager;
    }

    /**
     * Initialize this inistance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', (id) => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    async addConsentFile(consentFile: ConsentFile): Promise<void> {
        if (!consentFile) {
            throw new Error('empty file');
        }

        await this.channelManager.postToChannel(this.channelId, convertToOne(consentFile));
    }

    async entries(): Promise<ObjectData<ConsentFile>[]> {
        const objects: ObjectData<ConsentFile>[] = [];
        const instanceOwner = await getInstanceOwnerIdHash();

        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'ConsentFile'
        );

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            const dropoutFileData = new Buffer(data.fileData, 'base64').toString('ascii');

            // display just the consent files that belong to the current instance owner
            if (
                data.fileData === instanceOwner ||
                dropoutFileData.split('|')[1].split(':')[1] === instanceOwner
            ) {
                objects.push({...restObjectData, data: convertFromOne(data)});
            }
        }

        return objects;
    }

    async getOwnerConsentFile(): Promise<ObjectData<ConsentFile>> {
        const objects: ObjectData<ConsentFile>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'ConsentFile'
        );

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            const dataFromOne = convertToOne(data);

            if (dataFromOne.fileType === FileType.Consent) {
                objects.push({...restObjectData, data: convertFromOne(data)});
            }
        }

        // any user is sopose to heve just one consent file so if you are logged in,
        // in one will be just your file and that's why this function returns just the first object of the consent array
        return objects[0];
    }

    async getOwnerDropoutFile(): Promise<ObjectData<ConsentFile>> {
        const objects: ObjectData<ConsentFile>[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'ConsentFile'
        );

        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            const dataFromOne = convertToOne(data);

            if (dataFromOne.fileType === FileType.Dropout) {
                objects.push({...restObjectData, data: convertFromOne(data)});
            }
        }

        // any user is sopose to heve just one consent file so if you are logged in,
        // in one will be just your file and that's why this function returns just the first object of the consent array
        return objects[0];
    }

    async getEntryById(id: string): Promise<ObjectData<ConsentFile>> {
        const {data, ...restObjectData} = (await this.channelManager.getObjectWithTypeById(
            this.channelId,
            id,
            'ConsentFile'
        ))[0];
        return {...restObjectData, data: convertFromOne(data)};
    }
}
